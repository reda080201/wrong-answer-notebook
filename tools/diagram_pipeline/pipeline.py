from __future__ import annotations

import copy
import importlib.metadata
import os
import re
import subprocess
import sys
import tempfile
import threading
from collections import deque
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from . import VERSION
from .security import MAX_IMAGE, MAX_JSON, PipelineError, crop_box, digest, json_bytes, load_json, plain_path, read_bytes, relative_path, write_new

SCHEMA = "diagram-pipeline-v1"
PACKAGES = ("pypdfium2", "Pillow", "numpy", "opencv-python-headless", "matplotlib")


def versions():
    try:
        return {name: importlib.metadata.version(name) for name in PACKAGES}
    except importlib.metadata.PackageNotFoundError as exc:
        raise ModuleNotFoundError(f"Install locked dependency: {exc.name}", name=exc.name) from exc


def environment_fingerprint():
    font = importlib.metadata.distribution("matplotlib").locate_file("matplotlib/mpl-data/fonts/ttf/DejaVuSans.ttf")
    code = b"".join(read_bytes(file) for file in sorted(Path(__file__).parent.glob("*.py")))
    return {"libraries": versions(), "font": {"name": "DejaVu Sans", "sha256": digest(read_bytes(font))}, "codeSha256": digest(code), "dpi": {"source": 200, "vectorCandidate": 300, "redraw": 150}, "seed": 0}


def generation_input_hash(source, figure):
    return digest(json_bytes({"sourceSha256": source["sha256"], **{key: figure.get(key) for key in ("page", "crop", "questionCrop", "method", "spec", "parameters")}}))


def terminate_worker(process):
    if process.poll() is not None:
        return
    if os.name == "nt":
        # A Windows venv executable can be a launcher with a separate Python
        # child. Killing just Popen.pid can leave that worker and stderr alive.
        import ctypes
        directory = ctypes.create_unicode_buffer(32768)
        length = ctypes.windll.kernel32.GetSystemDirectoryW(directory, len(directory))
        if not 0 < length < len(directory):
            raise PipelineError("Cannot locate the Windows process-tree terminator")
        result = subprocess.run([str(Path(directory.value) / "taskkill.exe"), "/PID", str(process.pid), "/T", "/F"], shell=False, capture_output=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode and process.poll() is None:
            raise PipelineError("Could not terminate the isolated worker process tree")
    else:
        process.kill()


def run_worker(job, out, key):
    job_path = out / "jobs" / f"{key}.json"
    result_path = out / "jobs" / f"{key}.result.json"
    write_new(job_path, json_bytes(job))
    environment = {**os.environ, "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1", "MKL_NUM_THREADS": "1", "MPLCONFIGDIR": str(out / "font-cache")}
    command = [sys.executable, "-m", "tools.diagram_pipeline._worker", str(job_path), str(result_path)]
    process = subprocess.Popen(command, shell=False, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    errors = deque(maxlen=16)

    def drain_errors():
        while chunk := process.stderr.read(4096):
            errors.append(chunk)
    reader = threading.Thread(target=drain_errors, daemon=True)
    reader.start()
    try:
        process.wait(timeout=60)
        reader.join(timeout=1)
        if process.returncode:
            message = b"".join(errors).decode("utf-8", "replace")[-2500:]
            raise PipelineError(f"Isolated worker failed ({process.returncode}): {message}")
        result = load_json(result_path)
        if result.get("workerError", {}).get("kind") == "missing_dependency":
            name = result["workerError"]["name"]
            raise ModuleNotFoundError(f"Install locked dependency: {name}", name=name)
        return result
    except subprocess.TimeoutExpired as exc:
        raise PipelineError("Isolated worker exceeded the 60 second limit; evidence retained") from exc
    finally:
        try:
            terminate_worker(process)
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
            reader.join(timeout=1)
            process.stderr.close()


def inspect_input(path: Path, out: Path):
    path, out = plain_path(path), plain_path(out)
    content = read_bytes(path)
    suffix = path.suffix.lower()
    if suffix not in (".pdf", ".png", ".jpg", ".jpeg", ".webp"):
        raise PipelineError("Input must be PDF/PNG/JPEG/WebP")
    if suffix == ".pdf" and not content.startswith(b"%PDF-"):
        raise PipelineError("PDF content/extension mismatch")
    source = {"id": f"source-{digest(content)[:20]}", "path": f"inputs/{digest(content)}{suffix}", "sha256": digest(content), "kind": "pdf" if suffix == ".pdf" else "image"}
    write_new(out / source["path"], content)
    info = run_worker({"action": "inspect", "input": str(out / source["path"]), "source": source}, out, "inspect")
    source["pages"] = info["pages"]
    manifest = {"schemaVersion": SCHEMA, "pipelineVersion": VERSION, "createdAt": datetime.now(timezone.utc).isoformat(), "libraries": versions(), "sources": [source], "entries": [], "figures": []}
    write_new(out / "manifest.json", json_bytes(manifest))
    return {"manifest": str(out / "manifest.json"), "pages": len(source["pages"]), "next": "Add reviewed entry/question/crop definitions to a COPY of manifest.json; then render. No OCR or equation inference was performed."}


def validate_manifest(manifest):
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != SCHEMA:
        raise PipelineError("Unsupported internal manifest")
    sources = manifest.get("sources")
    entries = manifest.get("entries")
    figures = manifest.get("figures")
    if not isinstance(sources, list) or not sources or not isinstance(entries, list) or not entries or not isinstance(figures, list) or not figures or len(figures) > 300:
        raise PipelineError("Manifest needs sources, entries and 1..300 explicit figures")
    for collection in (sources, entries, figures):
        ids = [item.get("id") for item in collection if isinstance(item, dict)]
        if len(ids) != len(collection) or any(not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", key) for key in ids) or len(set(ids)) != len(ids):
            raise PipelineError("Manifest IDs must be unique safe identifiers")
    source_map = {source["id"]: source for source in sources}
    questions = {}
    for entry in entries:
        for question in entry.get("questions", []):
            key = question.get("key")
            if not isinstance(key, str) or not key or (entry["id"], key) in questions:
                raise PipelineError("Missing/duplicate question key")
            if not str(question.get("number", "")).strip():
                raise PipelineError("Question display number is required")
            questions[entry["id"], key] = question
            reference = question.get("source")
            if reference is not None:
                if not isinstance(reference, dict) or reference.get("sourceId") not in source_map:
                    raise PipelineError("Question source must identify a manifest sourceId")
                page = reference.get("page")
                if isinstance(page, bool) or not isinstance(page, int) or not 1 <= page <= len(source_map[reference["sourceId"]].get("pages", [])):
                    raise PipelineError("Question source page is out of range")
                if reference.get("crop"):
                    crop_box(reference["crop"])
    for figure in figures:
        if figure.get("sourceId") not in source_map or (figure.get("entryId"), figure.get("questionKey")) not in questions:
            raise PipelineError("Figure source or question does not exist")
        crop_box(figure.get("crop"))
        if figure.get("questionCrop"):
            crop_box(figure["questionCrop"])
        source = source_map[figure["sourceId"]]
        page = figure.get("page")
        if isinstance(page, bool) or not isinstance(page, int) or not 1 <= page <= len(source.get("pages", [])):
            raise PipelineError("Invalid source page")
    return source_map, questions


def render(path: Path, out: Path):
    manifest = load_json(path)
    source_map, _ = validate_manifest(manifest)
    out = plain_path(out)
    manifest = copy.deepcopy(manifest)
    environment = environment_fingerprint()
    fingerprint = digest(json_bytes({"input": manifest, "version": VERSION, "environment": environment}))
    target = out / "manifest.json"
    if target.exists():
        cached = load_json(target)
        if cached.get("runFingerprint") != fingerprint:
            raise PipelineError("Output belongs to another run; choose a new output directory")
        verify(target)
        return {"manifest": str(target), "cached": True, "mathematicalEquivalence": "not_proven"}
    for source in manifest["sources"]:
        data = read_bytes(relative_path(path.parent, source["path"]))
        if digest(data) != source["sha256"]:
            raise PipelineError("Input source hash mismatch")
        write_new(relative_path(out, source["path"]), data)
    failed = []
    for entry in manifest["entries"]:
        for question in entry["questions"]:
            reference = question.get("source")
            if not reference:
                continue
            source = source_map[reference["sourceId"]]
            region = reference.get("crop", {"x": 0, "y": 0, "width": 1, "height": 1})
            figure = {"page": reference["page"], "crop": region, "method": "original"}
            if reference.get("crop"):
                figure["questionCrop"] = region
            key = "question-" + digest(json_bytes([entry["id"], question["key"]]))[:24]
            question["sourceResult"] = run_worker({"action": "render", "input": str(relative_path(out, source["path"])), "source": source, "figure": figure, "out": str(out)}, out, key)
            question["sourceResult"]["generationInputHash"] = generation_input_hash(source, figure)
    for index, figure in enumerate(manifest["figures"]):
        print(f"render {index + 1}/{len(manifest['figures'])}: {figure['id']}", file=sys.stderr)
        source = source_map[figure["sourceId"]]
        job = {"action": "render", "input": str(relative_path(out, source["path"])), "source": source, "figure": figure, "out": str(out)}
        figure["result"] = run_worker(job, out, f"figure-{index + 1}")
        figure["result"]["generationInputHash"] = generation_input_hash(source, figure)
        if figure["result"]["status"] == "failed":
            failed.append(figure["id"])
    manifest.update(runFingerprint=fingerprint, libraries=versions(), pipelineVersion=VERSION, environment=environment)
    write_new(target, json_bytes(manifest))
    if failed:
        raise PipelineError(f"Generation failed for {failed}; original artifacts retained in {target}. Correct the spec and render to a new directory.")
    report = verify(target)
    return {"manifest": str(target), **report}


def verify(path: Path):
    manifest = load_json(path)
    sources, _ = validate_manifest(manifest)
    count = 0
    for source in manifest["sources"]:
        if digest(read_bytes(relative_path(path.parent, source["path"]))) != source["sha256"]:
            raise PipelineError("Input source hash mismatch")
    jobs = [(sources[figure["sourceId"]], figure, figure.get("result")) for figure in manifest["figures"]]
    for entry in manifest["entries"]:
        for question in entry["questions"]:
            if "sourceResult" in question:
                reference = question["source"]
                figure = {"page": reference["page"], "crop": reference.get("crop", {"x": 0, "y": 0, "width": 1, "height": 1}), "method": "original"}
                if reference.get("crop"):
                    figure["questionCrop"] = reference["crop"]
                jobs.append((sources[reference["sourceId"]], figure, question["sourceResult"]))
    verified_pages = set()
    for index, (source, figure, result) in enumerate(jobs):
        if not result or result.get("status") == "failed":
            raise PipelineError("Unrendered/failed figure or source page")
        if result.get("generationInputHash") != generation_input_hash(source, figure):
            raise PipelineError("Generation inputs changed; regenerate rather than relabel old assets")
        page_key = (source["sha256"], figure["page"], result["artifacts"]["sourcePage"]["sha256"])
        job = {"action": "verify", "input": str(relative_path(path.parent, source["path"])), "source": source, "figure": figure, "artifacts": result["artifacts"], "root": str(path.parent.absolute()), "pageVerified": page_key in verified_pages}
        key = f"verify-{index}-" + digest(json_bytes(job))[:24]
        run_worker(job, path.parent / "verification", key)
        verified_pages.add(page_key)
        count += len(result["artifacts"])
    return {"machineChecks": "passed", "sourceRegionsMatch": True, "mathematicalEquivalence": "not_proven", "reviewRequired": True, "checkedAssets": count}


def package(path: Path, output: Path):
    verify(path)
    manifest = load_json(path)
    assets = {}
    entries = []
    used_basenames = set()

    def add_artifacts(artifacts):
        for artifact in artifacts.values():
            name = artifact["path"]
            filename = relative_path(path.parent, name)
            if name not in assets and Path(name).name.casefold() in used_basenames:
                raise PipelineError("Basename collision")
            used_basenames.add(Path(name).name.casefold())
            if name in assets and assets[name]["sha256"] != artifact["sha256"]:
                raise PipelineError("Conflicting artifact identity")
            assets[name] = {"file": filename, "sha256": artifact["sha256"], "size": filename.stat().st_size}
    for entry in manifest["entries"]:
        data = copy.deepcopy(entry.get("template", {}))
        if not isinstance(data, dict):
            raise PipelineError("Entry template must be an object")
        # Template image references cannot silently refer to absent assets.
        data.update(entryKind="problem_sheet", title=entry.get("title", "문제지"), subject=entry.get("subject", "수학"), questions=[], figures=[], questionSourceCrops=[], sourcePageImages=[])
        for question in entry["questions"]:
            figures = [figure for figure in manifest["figures"] if figure["entryId"] == entry["id"] and figure["questionKey"] == question["key"]]
            mapping = {figure["id"]: "f_" + digest(json_bytes([entry["id"], question["key"], figure["id"]]))[:24] for figure in figures}

            def replace(value):
                if isinstance(value, str):
                    def token(match):
                        if match[1] not in mapping:
                            raise PipelineError(f"Unknown figure token: {match[1]}")
                        return f"[FIGURE:{mapping[match[1]]}]"
                    return re.sub(r"\[FIGURE:([^\]]+)\]", token, value)
                if isinstance(value, list):
                    return [replace(v) for v in value]
                if isinstance(value, dict):
                    result = {k: replace(v) for k, v in value.items()}
                    if "figureId" in result:
                        if result["figureId"] not in mapping:
                            raise PipelineError("Unknown segment figureId")
                        result["figureId"] = mapping[result["figureId"]]
                    return result
                return value

            q = replace({k: v for k, v in question.items() if k not in ("key", "number", "source", "sourceResult")})
            q["questionNumber"] = str(question["number"])
            q["figureIds"] = list(mapping.values())
            pages = []
            if question.get("sourceResult"):
                artifacts = question["sourceResult"]["artifacts"]
                add_artifacts({k: v for k, v in artifacts.items() if k != "original"})
                page_asset = artifacts["sourcePage"]["path"]
                if page_asset not in data["sourcePageImages"]:
                    data["sourcePageImages"].append(page_asset)
                page_index = data["sourcePageImages"].index(page_asset) + 1
                pages.append(page_index)
                if "questionCrop" in artifacts:
                    data["questionSourceCrops"].append({"id": "crop-" + digest(json_bytes([entry["id"], question["key"]]))[:24], "questionNumber": str(question["number"]), "image": artifacts["questionCrop"]["path"], "sourcePageImage": page_asset, "page": page_index, "cropRect": question["source"]["crop"]})
            visible_flow = json_bytes({k: v for k, v in q.items() if k != "figureIds"}).decode("utf-8")
            if any(identifier not in visible_flow for identifier in mapping.values()):
                raise PipelineError("Every figure needs an explicit segment/token location; tail placement is not inferred")
            for figure in figures:
                artifacts = figure["result"]["artifacts"]
                add_artifacts(artifacts)
                page_asset = artifacts["sourcePage"]["path"]
                if page_asset not in data["sourcePageImages"]:
                    data["sourcePageImages"].append(page_asset)
                page_index = data["sourcePageImages"].index(page_asset) + 1
                pages.append(page_index)
                original = artifacts["original"]
                exported = {"id": mapping[figure["id"]], "questionNumber": str(question["number"]), "title": figure.get("title", "그림"), "caption": figure.get("caption", ""), "original": {"image": original["path"], "sourcePageImage": page_asset, "crop": figure["crop"]}, "image": original["path"], "source": "original", "preferredRepresentation": "original", "processingStatus": "needs_review", "needsReview": True}
                if "cleaned" in artifacts:
                    exported["cleaned"] = {"image": artifacts["cleaned"]["path"], "generatedBy": figure["result"]["method"], "generatedAt": manifest["createdAt"], "sourceImageHash": original["sha256"], "promptVersion": f"diagram-pipeline-{VERSION}"}
                data["figures"].append(exported)
                if "questionCrop" in artifacts:
                    crop = artifacts["questionCrop"]
                    data["questionSourceCrops"].append({"id": mapping[figure["id"]] + "-question", "questionNumber": str(question["number"]), "image": crop["path"], "sourcePageImage": page_asset, "page": page_index, "cropRect": figure["questionCrop"]})
            if pages:
                q["source"] = {"page": pages[0]}
            data["questions"].append(q)
        entries.append(data)
    document = {"schemaVersion": "wrong-answer-notebook-import-v2", "importType": "problem_sheet", "entries": entries}
    json_data = json_bytes(document)
    if len(json_data) > MAX_JSON or len(assets) > 300 or sum(asset["size"] for asset in assets.values()) + len(json_data) > 1024**3:
        raise PipelineError("Package exceeds the app import policy")
    # Inspect all declared image references before creating the archive.
    def refs(value, key=""):
        if isinstance(value, str) and value and key in ("image", "sourcePageImage", "images", "questionImages", "sourcePageImages", "linkedSourcePageImages") and value not in assets:
            raise PipelineError(f"Declared asset is absent: {value}")
        if isinstance(value, list):
            for item in value:
                refs(item, key)
        elif isinstance(value, dict):
            for field, item in value.items():
                refs(item, field)
    refs(document)
    output = plain_path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".diagram-package-", suffix=".zip", dir=output.parent)
    os.close(descriptor)
    temp = Path(temporary)
    try:
        with zipfile.ZipFile(temp, "w", zipfile.ZIP_DEFLATED) as archive:
            contents = [("import.json", None), *sorted(assets.items())]
            for name, asset in contents:
                content = json_data if asset is None else read_bytes(asset["file"], MAX_IMAGE)
                if asset is not None and digest(content) != asset["sha256"]:
                    raise PipelineError("Artifact changed during packaging")
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED)
        if temp.stat().st_size > 500 * 1024**2:
            raise PipelineError("ZIP exceeds 500MiB")
        with zipfile.ZipFile(temp) as archive:
            if archive.testzip() or archive.read("import.json") != json_data or any(digest(archive.read(name)) != asset["sha256"] for name, asset in assets.items()):
                raise PipelineError("ZIP re-open verification failed")
        try:
            os.link(temp, output)  # Atomic publish, never replace an existing file.
        except FileExistsError as exc:
            raise PipelineError("Output ZIP already exists; choose a new filename") from exc
        import hashlib
        with output.open("rb") as stream:
            checksum = hashlib.file_digest(stream, "sha256").hexdigest()
        return {"zip": str(output), "sha256": checksum, "images": len(assets), "mathematicalEquivalence": "not_proven", "reviewRequired": True}
    finally:
        temp.unlink(missing_ok=True)
