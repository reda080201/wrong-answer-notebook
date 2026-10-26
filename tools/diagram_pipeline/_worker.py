"""Isolated single-job native worker. Never used as an app trust token."""
import sys
from pathlib import Path

from .resources import limit_worker
from .security import MAX_JSON, PipelineError, digest, json_bytes, load_json, read_bytes, write_new


def process(job):
    from .image_io import crop_image, decode, pdf_info, pdf_page, png
    source = job["source"]
    path = Path(job["input"])
    data = read_bytes(path)
    if digest(data) != source["sha256"]:
        raise PipelineError("Source changed after inspection")
    def source_page(page_number):
        if source["kind"] == "pdf":
            return pdf_page(path, page_number)
        if source["kind"] == "svg":
            from .svg_renderer import render_svg
            return render_svg(data)[0]
        return decode(data, path.suffix)

    if job["action"] == "inspect":
        if source["kind"] == "pdf":
            return {"pages": pdf_info(path)}
        image = source_page(1)
        return {"pages": [{"number": 1, "width": image.width, "height": image.height, "rotation": 0, "objectCounts": {}}]}
    if job["action"] == "verify":
        from PIL import ImageChops
        artifacts = job["artifacts"]
        root = Path(job["root"])
        from .security import MAX_IMAGE, relative_path
        decoded = {}
        for name, artifact in artifacts.items():
            content = read_bytes(relative_path(root, artifact["path"]), MAX_IMAGE)
            if digest(content) != artifact["sha256"]:
                raise PipelineError("Artifact hash mismatch")
            image = decode(content, Path(artifact["path"]).suffix)
            if list(image.size) != [artifact["width"], artifact["height"]]:
                raise PipelineError("Artifact dimensions differ from report")
            if name != "cleaned":
                decoded[name] = image
        figure = job["figure"]
        page = decoded["sourcePage"]
        if not job.get("pageVerified"):
            expected = source_page(figure["page"])
            if expected.size != page.size or ImageChops.difference(expected, page).getbbox() is not None:
                raise PipelineError("Source page pixels do not match the actual input")
        for name, crop in [("original", figure["crop"]), ("questionCrop", figure.get("questionCrop"))]:
            if name not in decoded:
                continue
            if crop is None:
                raise PipelineError("Question crop has no declared source region")
            expected = crop_image(page, crop)
            if expected.size != decoded[name].size or ImageChops.difference(expected, decoded[name]).getbbox() is not None:
                raise PipelineError(f"{name} pixels do not match the declared source region")
        if figure.get("method") == "svg_render" or (source["kind"] == "svg" and figure.get("method", "auto") == "auto"):
            from .svg_renderer import render_svg
            candidate = figure.get("svg")
            svg = read_bytes(relative_path(root, candidate["path"]), MAX_JSON) if candidate else data
            if candidate and digest(svg) != candidate.get("sha256"):
                raise PipelineError("SVG candidate hash mismatch")
            expected, _ = render_svg(svg, dpi=figure.get("parameters", {}).get("dpi", 96))
            if not candidate:
                expected = crop_image(expected, figure["crop"])
            actual = decode(read_bytes(relative_path(root, artifacts["cleaned"]["path"]), MAX_IMAGE), ".png")
            if expected.size != actual.size or ImageChops.difference(expected, actual).getbbox() is not None:
                raise PipelineError("SVG output pixels differ from the recorded source")
        return {"machineChecks": "passed", "sourceRegionMatch": True, "mathematicalEquivalence": "not_proven"}
    figure = job["figure"]
    out = Path(job["out"])
    page_number = figure["page"]
    if not isinstance(page_number, int) or isinstance(page_number, bool) or not 1 <= page_number <= len(source["pages"]):
        raise PipelineError("Source page is out of range")
    page = source_page(page_number)
    original = crop_image(page, figure["crop"])
    artifacts = {}

    def save(name, image, raw=None):
        content = raw if raw is not None else png(image)
        decoded = decode(content, ".png")
        page_identity = f"{source['id']}_p{page_number}_" if name == "page" else ""
        filename = f"assets/{page_identity}{digest(content)}_{name}.png"
        write_new(out / filename, content)
        return {"path": filename, "sha256": digest(content), "width": decoded.width, "height": decoded.height}

    artifacts["sourcePage"] = save("page", page)
    artifacts["original"] = save("original", original)
    if figure.get("questionCrop"):
        artifacts["questionCrop"] = save("question", crop_image(page, figure["questionCrop"]))
    result = {"artifacts": artifacts, "status": "needs_review", "mathematicalEquivalence": "not_proven", "messages": []}
    try:
        method = figure.get("method", "auto")
        if method == "auto":
            # Object existence is provenance, not evidence of semantic equality.
            counts = source["pages"][page_number - 1].get("objectCounts", {})
            method = "pdf_vector_render" if source["kind"] == "pdf" and counts.get("2", 0) else "raster_cleanup"
        if source["kind"] == "svg" and figure.get("method", "auto") == "auto":
            method = "svg_render"
        if method == "svg_render":
            from .security import relative_path
            from .svg_renderer import render_svg
            candidate = figure.get("svg")
            svg = read_bytes(relative_path(out, candidate["path"]), MAX_JSON) if candidate else data
            if candidate and digest(svg) != candidate.get("sha256"):
                raise PipelineError("SVG candidate hash mismatch")
            if not candidate and source["kind"] != "svg":
                raise PipelineError("SVG rendering needs an explicit SVG candidate")
            cleaned, metadata = render_svg(svg, dpi=figure.get("parameters", {}).get("dpi", 96))
            if not candidate:
                cleaned = crop_image(cleaned, figure["crop"])
            artifacts["cleaned"] = save("cleaned", cleaned)
            result["renderer"] = {**metadata, "outputWidth": cleaned.width, "outputHeight": cleaned.height}
        elif method == "pdf_vector_render":
            if source["kind"] != "pdf":
                raise PipelineError("Vector rendering requires a PDF source")
            cleaned = pdf_page(path, page_number, dpi=300, crop=figure["crop"])
            artifacts["cleaned"] = save("cleaned", cleaned)
        elif method in ("raster_cleanup", "raster_tracing"):
            import cv2
            import numpy as np
            from PIL import Image
            cv2.setNumThreads(1)
            gray = cv2.cvtColor(np.array(original), cv2.COLOR_RGB2GRAY)
            angle = figure.get("parameters", {}).get("deskewDegrees", 0)
            if not isinstance(angle, (float, int)) or isinstance(angle, bool) or not -5 <= angle <= 5:
                raise PipelineError("Deskew must be an explicit -5..5 degree value")
            if angle:
                transform = cv2.getRotationMatrix2D((gray.shape[1] / 2, gray.shape[0] / 2), angle, 1)
                gray = cv2.warpAffine(gray, transform, (gray.shape[1], gray.shape[0]), borderValue=255)
            # No component removal: tiny open points/numbers remain candidates.
            binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
            if method == "raster_tracing":
                contours, hierarchy = cv2.findContours(255 - binary, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE)
                if len(contours) > 20_000:
                    raise PipelineError("Tracing contour limit exceeded")
                traced = np.full_like(binary, 255)
                if hierarchy is not None:
                    for index, contour in enumerate(contours):
                        depth, parent = 0, int(hierarchy[0][index][3])
                        while parent >= 0:
                            depth += 1
                            parent = int(hierarchy[0][parent][3])
                        cv2.drawContours(traced, [contour], -1, 0 if depth % 2 == 0 else 255, cv2.FILLED)
                binary = traced
                result["messages"].append(f"Traced {len(contours)} observed contours; labels/topology not independently verified")
            artifacts["cleaned"] = save("cleaned", Image.fromarray(binary))
            result["messages"].append("Threshold/deskew can alter fine marks; compare with original")
        elif method == "computational_redraw":
            from .drawing import redraw
            content, messages = redraw(figure.get("spec"))
            artifacts["cleaned"] = save("cleaned", None, content)
            result["messages"].extend(messages)
            result["messages"].append("Rendered the supplied spec; correspondence to the source is not proven")
        elif method == "original":
            result["messages"].append("No cleaned candidate requested")
        else:
            raise PipelineError("Unknown generation method")
        result["method"] = method
    except (ValueError, OSError, KeyError, TypeError, MemoryError) as exc:
        result.update(status="failed", method=figure.get("method"), failure=f"{type(exc).__name__}: {exc}")
        artifacts.pop("cleaned", None)
    return result


def main():
    policy = limit_worker()
    job = load_json(Path(sys.argv[1]))
    try:
        result = process(job)
    except ModuleNotFoundError as exc:
        result = {"workerError": {"kind": "missing_dependency", "name": exc.name}}
    result["resourcePolicy"] = policy
    write_new(Path(sys.argv[2]), json_bytes(result))


if __name__ == "__main__":
    main()
