"""Bind model observations to inspected immutable evidence; no model trust is promoted."""
import copy
import re
import stat
import zipfile
from pathlib import Path
from urllib.parse import quote
from .security import MAX_INPUT, PipelineError, digest, json_bytes, load_json, plain_path, read_bytes, relative_path, write_new
from .vision_schema import load_vision


def question_identity(entry_key, question_key):
    return "/".join(quote(part, safe="") for part in (entry_key, question_key))


def identity(*parts):
    return "v_" + digest(json_bytes(parts))[:28]


def import_vision(inspection, analysis, source_map, out, excluded=()):
    from .pipeline import validate_manifest
    manifest = load_json(inspection)
    vision = load_vision(analysis)
    mapping = load_json(source_map)
    if not isinstance(mapping, dict) or any(not isinstance(v, str) for v in mapping.values()) or set(mapping) != {s["sourceKey"] for s in vision["sources"]}:
        raise PipelineError("source-map must exactly match observed source keys")
    by_id = {s["id"]: s for s in manifest["sources"]}
    for source in vision["sources"]:
        bound = by_id.get(mapping[source["sourceKey"]])
        if not bound or source.get("pageCount", len(bound["pages"])) != len(bound["pages"]):
            raise PipelineError("Source page count/identity mismatch")
    def reference(ref):
        result = {"sourceId": mapping[ref["sourceKey"]], "page": ref["page"]}
        if ref["page"] > len(by_id[result["sourceId"]]["pages"]):
            raise PipelineError("Source physical page is out of range")
        if "questionRect" in ref:
            result["crop"] = ref["questionRect"]
        return result
    blocked = []
    prepared = copy.deepcopy(manifest)
    prepared.update(entries=[], figures=[], visionJob={"analysisState": "observed", "generationState": "not_started", "integrityState": "unchecked", "mathematicalEquivalence": "not_proven"})
    excluded = set(excluded)
    known = {question_identity(e["entryKey"], q["questionKey"]) for e in vision["entries"] for q in e["questions"]}
    if not excluded <= known:
        raise PipelineError("Unknown excluded question identity")
    for entry in vision["entries"]:
        target = {"id": identity(entry["entryKey"]), "title": entry["title"], "subject": entry["subject"], "questions": [], "template": {"answerKey": []}}
        for q in entry["questions"]:
            key = question_identity(entry["entryKey"], q["questionKey"])
            number = q["questionNumber"]
            def normalized(n):
                return re.sub(r"^0+(?=\d)", "", re.sub(r"\s|번$", "", n or ""))
            ambiguous = number is None or not number.strip() or sum(normalized(other["questionNumber"]) == normalized(number) for other in entry["questions"] if question_identity(entry["entryKey"], other["questionKey"]) not in excluded) > 1
            for f in vision["figures"]:
                if f["entryKey"] != entry["entryKey"] or f["questionKey"] != q["questionKey"]:
                    continue
                qr = q["source"].get("questionRect")
                fr = f["source"]["rect"]
                if qr and f["source"]["sourceKey"] == q["source"]["sourceKey"] and f["source"]["page"] == q["source"]["page"] and not (fr["x"] >= qr["x"] and fr["y"] >= qr["y"] and fr["x"] + fr["width"] <= qr["x"] + qr["width"] and fr["y"] + fr["height"] <= qr["y"] + qr["height"]):
                    blocked.append({"question": key, "reason": "Figure extends outside observed question rectangle; review placement"})
                    ambiguous = True
            if ambiguous:
                blocked.append({"question": key, "reason": "Missing/ambiguous printed number; explicit review or exclusion required"})
            if key in excluded:
                continue
            if ambiguous:
                continue
            figures = [f for f in vision["figures"] if f["entryKey"] == entry["entryKey"] and f["questionKey"] == q["questionKey"]]
            ids = {f["figureKey"]: identity(entry["entryKey"], q["questionKey"], f["figureKey"]) for f in figures}
            segments = copy.deepcopy(q["contentSegments"])
            for segment in segments:
                if segment["type"] == "figure":
                    segment["figureId"] = ids[segment.pop("figureKey")]
            refs = [reference(q["source"])]
            for ref in q.get("sourceRefs", []):
                converted = reference(ref)
                if converted not in refs:
                    refs.append(converted)
            for f in figures:
                converted = reference(f["source"])
                if not any(r["sourceId"] == converted["sourceId"] and r["page"] == converted["page"] for r in refs):
                    refs.append(converted)
            item = {"key": identity(entry["entryKey"], q["questionKey"]), "number": number, "questionText": q["questionText"], "contentSegments": segments, "choices": [re.sub(r"\[FIGURE:([^\]]+)\]", lambda m: f"[FIGURE:{ids[m[1]]}]", c) for c in q["choices"]], "source": refs[0], "sourceRefs": refs, "needsReview": True}
            target["questions"].append(item)
            if q.get("extractedAnswer") or q.get("explanationDraft"):
                target["template"]["answerKey"].append({"id": identity(entry["entryKey"], q["questionKey"], "answer"), "questionNumber": number, "answer": q.get("extractedAnswer", ""), "explanation": q.get("explanationDraft", ""), "importantPoints": [], "needsReview": True, "processingStatus": "needs_review"})
            for f in figures:
                ref = reference(f["source"])
                method = "auto"
                if f["strategyHint"] == "preserve_original":
                    method = "original"
                candidate = {"id": ids[f["figureKey"]], "entryId": target["id"], "questionKey": item["key"], **ref, "crop": f["source"]["rect"], "method": method, "allowCandidateFallback": True, "analysisState": "uncertain" if f["uncertainties"] else "observed", "mathematicalEquivalence": "not_proven"}
                if q["source"]["sourceKey"] == f["source"]["sourceKey"] and q["source"]["page"] == f["source"]["page"] and q["source"].get("questionRect"):
                    candidate["questionCrop"] = q["source"]["questionRect"]
                if f["strategyHint"] == "propose_computational_redraw" and f["proposedSpec"] and not f["uncertainties"]:
                    candidate.update(method="computational_preview", spec=f["proposedSpec"])
                prepared["figures"].append(candidate)
        if target["questions"]:
            prepared["entries"].append(target)
    report = {"blocked": blocked, "excluded": sorted(excluded), "audit": vision["audit"], "mathematicalEquivalence": "not_proven"}
    write_new(out / "adapter-report.json", json_bytes(report))
    if any(b["question"] not in excluded for b in blocked):
        raise PipelineError("Review blocked questions in adapter-report.json; explicitly exclude them or correct the analysis")
    validate_manifest(prepared)
    for source in prepared["sources"]:
        data = read_bytes(relative_path(inspection.parent, source["path"]))
        if digest(data) != source["sha256"]:
            raise PipelineError("Original source hash mismatch")
        write_new(relative_path(out, source["path"]), data)
    write_new(out / "generated-manifest.json", json_bytes(prepared))
    return {"manifest": str(out / "generated-manifest.json"), **report}


def unpack_job(path, out):
    """Extract only a bounded, exact job archive. Model data never selects paths."""
    if out.exists():
        raise PipelineError("Choose a new job output directory")
    plain_path(out)
    if len(read_bytes(path, MAX_INPUT)) > MAX_INPUT:
        raise PipelineError("Job too large")
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > 105 or sum(e.file_size for e in entries) > MAX_INPUT:
            raise PipelineError("Job archive exceeds policy")
        names = set()
        for e in entries:
            relative_path(out, e.filename)
            if e.is_dir() or e.filename.casefold() in names or stat.S_ISLNK(e.external_attr >> 16) or e.file_size > MAX_INPUT:
                raise PipelineError("Unsafe/duplicate job entry")
            names.add(e.filename.casefold())
            with archive.open(e) as stream:
                data = stream.read(min(e.file_size, MAX_INPUT) + 1)
            if len(data) != e.file_size:
                raise PipelineError("Job size mismatch")
            write_new(relative_path(out, e.filename), data)
    job = load_json(out / "job.json")
    if not isinstance(job, dict) or set(job) != {"schemaVersion", "sources"} or job["schemaVersion"] != "vision-import-job-v1" or not isinstance(job["sources"], list) or not 1 <= len(job["sources"]) <= 100:
        raise PipelineError("Unsupported job descriptor")
    expected = {"job.json", "analysis.json"}
    keys = set()
    for source in job["sources"]:
        if not isinstance(source, dict) or set(source) != {"sourceKey", "filename", "sha256"} or not isinstance(source["sourceKey"], str) or source["sourceKey"] in keys:
            raise PipelineError("Invalid job source identity")
        keys.add(source["sourceKey"])
        file = relative_path(out, source["filename"])
        if source["filename"] in expected or digest(read_bytes(file)) != source["sha256"]:
            raise PipelineError("Job source hash/identity mismatch")
        expected.add(source["filename"])
    if {e.filename for e in entries} != expected:
        raise PipelineError("Unexpected/missing job assets")
    return job


def run_vision(job_path, out, excluded=()):
    from .pipeline import inspect_input, render, verify, package
    if out.exists():
        raise PipelineError("Choose a new run output directory")
    job = unpack_job(job_path, out / "job")
    manifests, mapping = [], {}
    for i, source in enumerate(job["sources"]):
        result = inspect_input(relative_path(out / "job", source["filename"]), out / f"inspect-{i}")
        manifest = load_json(Path(result["manifest"]))
        bound = manifest["sources"][0]
        mapping[source["sourceKey"]] = bound["id"]
        manifests.append(manifest)
        write_new(relative_path(out / "inspection", bound["path"]), read_bytes(relative_path(Path(result["manifest"]).parent, bound["path"])))
    combined = copy.deepcopy(manifests[0])
    combined["sources"] = list({s["id"]: s for m in manifests for s in m["sources"]}.values())
    inspection = out / "inspection/manifest.json"
    write_new(inspection, json_bytes(combined))
    map_path = out / "source-map.json"
    write_new(map_path, json_bytes(mapping))
    result = import_vision(inspection, out / "job/analysis.json", map_path, out / "prepared", excluded)
    rendered = render(Path(result["manifest"]), out / "rendered")
    final = Path(rendered["manifest"])
    return {**package(final, out / "output-import-v2.zip"), "verification": verify(final), "adapterReport": str(out / "prepared/adapter-report.json")}
