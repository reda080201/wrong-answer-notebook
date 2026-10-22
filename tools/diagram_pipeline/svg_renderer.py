"""Constrained, offline SVG rasterization. No Cairo, GTK, network or shell."""
from __future__ import annotations

import io
import math
import re
import xml.etree.ElementTree as ET

from .security import MAX_JSON, PipelineError, dimensions, number

SVG_NS = "http://www.w3.org/2000/svg"
TAGS = {"svg", "g", "defs", "clipPath", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "title", "desc", "use"}
ATTRS = {"id", "version", "width", "height", "viewBox", "preserveAspectRatio", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "transform", "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit", "stroke-opacity", "opacity", "clip-path", "clip-rule", "clipPathUnits", "font-family", "font-size", "font-style", "font-weight", "text-anchor", "dominant-baseline", "dx", "dy", "href", "style", "space"}
STYLE = {"fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit", "stroke-opacity", "opacity", "font-family", "font-size", "font-style", "font-weight", "text-anchor", "dominant-baseline", "clip-path"}


def length(value: str | None, fallback: float | None = None) -> float:
    if value is None and fallback is not None:
        return fallback
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?|\.\d+)\s*(px|pt|in|mm|cm)?\s*", value or "")
    if not match:
        raise PipelineError("SVG viewport needs finite absolute units, not percentages")
    result = float(match[1]) * {None: 1, "px": 1, "pt": 96 / 72, "in": 96, "mm": 96 / 25.4, "cm": 96 / 2.54}[match[2]]
    if not math.isfinite(result) or result <= 0:
        raise PipelineError("Invalid SVG viewport")
    return result


def inspect_svg(data: bytes):
    if not data or len(data) > MAX_JSON or b"<!" in data:
        raise PipelineError("SVG exceeds policy or contains declarations/entities")
    try:
        text = data.decode("utf-8-sig")
        if "<!" in text or "\x00" in text:
            raise PipelineError("SVG declarations/entities are forbidden")
        root = ET.fromstring(text)
    except (ET.ParseError, UnicodeError, ValueError) as exc:
        raise PipelineError("Malformed SVG") from exc
    if root.tag not in ("svg", f"{{{SVG_NS}}}svg"):
        raise PipelineError("Expected SVG root")
    ids, uses, clips, fonts = {}, [], [], set()
    count = 0
    stack = [(root, 0)]
    while stack:
        node, depth = stack.pop()
        count += 1
        tag = node.tag.removeprefix(f"{{{SVG_NS}}}")
        if tag not in TAGS or depth > 48 or count > 20_000:
            raise PipelineError("Unsupported SVG element or complexity")
        for raw_key, value in node.attrib.items():
            key = raw_key
            if raw_key.startswith("{"):
                namespace, key = raw_key[1:].split("}", 1)
                if (namespace, key) not in (("http://www.w3.org/1999/xlink", "href"), ("http://www.w3.org/XML/1998/namespace", "space")):
                    raise PipelineError("Unsupported SVG attribute namespace")
            if key not in ATTRS or len(value) > 1_000_000 or "\\" in value or "/*" in value:
                raise PipelineError(f"Unsupported SVG attribute: {key}")
            if key == "href":
                if not re.fullmatch(r"#[A-Za-z_][\w.-]*", value):
                    raise PipelineError("SVG external references are forbidden")
                uses.append((node, value[1:]))
            if key == "style":
                for declaration in value.split(";"):
                    if not declaration.strip():
                        continue
                    prop, separator, _ = declaration.partition(":")
                    if not separator or prop.strip() not in STYLE:
                        raise PipelineError("Unsupported SVG inline style")
            # Only bounded, local clip references are accepted. No external/data URIs.
            clips.extend(re.findall(r"url\(\s*#([A-Za-z_][\w.-]*)\s*\)", value, flags=re.I))
            stripped = re.sub(r"url\(\s*#[A-Za-z_][\w.-]*\s*\)", "", value, flags=re.I)
            if re.search(r"url\s*\(|@|javascript:|https?:|file:|data:", stripped, re.I):
                raise PipelineError("SVG external resources/CSS are forbidden")
            if key == "font-family":
                fonts.add(value)
        identity = node.get("id")
        if identity:
            if identity in ids:
                raise PipelineError("Duplicate SVG ID")
            ids[identity] = node
        stack.extend((child, depth + 1) for child in node)
    if len(uses) > 1000:
        raise PipelineError("SVG reference limit exceeded")
    # Reject recursive and exponentially nested use expansion before native parsing.
    for _, target in uses:
        if target not in ids or any(child.tag.endswith("use") for child in ids[target].iter()):
            raise PipelineError("Missing or nested SVG use reference")
    for target in clips:
        if target not in ids or ids[target].tag.removeprefix(f"{{{SVG_NS}}}") != "clipPath":
            raise PipelineError("Missing or unsupported SVG clip reference")
        if any("url(" in value.lower() or key.endswith("href") for child in ids[target].iter() for key, value in child.attrib.items()):
            raise PipelineError("Nested/recursive SVG clip reference")
    viewbox = root.get("viewBox")
    values = None
    if viewbox:
        try:
            values = [float(part) for part in re.split(r"[\s,]+", viewbox.strip())]
        except ValueError as exc:
            raise PipelineError("Invalid SVG viewBox") from exc
        if len(values) != 4 or not all(math.isfinite(v) for v in values) or min(values[2:]) <= 0:
            raise PipelineError("Invalid SVG viewBox")
    width = length(root.get("width"), values[2] if values else None)
    height = length(root.get("height"), values[3] if values else None)
    dimensions(math.ceil(width), math.ceil(height))
    return {"width": width, "height": height, "viewBox": values, "fonts": sorted(fonts), "textPolicy": "source-preserved; visual comparison required"}


def render_svg(data: bytes, *, dpi=96):
    info = inspect_svg(data)
    dpi = number(dpi, "SVG DPI", 1200)
    if dpi < 36:
        raise PipelineError("SVG DPI must be between 36 and 1200")
    width, height = math.ceil(info["width"] * dpi / 96), math.ceil(info["height"] * dpi / 96)
    dimensions(width, height)
    import pymupdf
    from PIL import Image
    # Native renderer receives bytes, never a filename from which it could resolve assets.
    with pymupdf.open(stream=data, filetype="svg") as document:
        page = document[0]
        if page.rect.is_empty or page.rect.is_infinite:
            raise PipelineError("Invalid native SVG page rectangle")
        scale = info["width"] / page.rect.width * dpi / 96
        vertical_scale = info["height"] / page.rect.height * dpi / 96
        if not math.isclose(scale, vertical_scale, rel_tol=1e-6, abs_tol=1e-8):
            raise PipelineError("SVG renderer changed the viewport aspect ratio")
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        dimensions(pixmap.width, pixmap.height)
        if (pixmap.width, pixmap.height) != (width, height):
            raise PipelineError("SVG renderer changed output dimensions")
        image = Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("RGB")
    return image, {**info, "renderer": "pymupdf", "version": pymupdf.VersionBind, "dpi": dpi, "outputWidth": width, "outputHeight": height, "mathematicalEquivalence": "not_proven"}
