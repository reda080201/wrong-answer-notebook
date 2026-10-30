"""Shared, bounded vision-v1 contract. Observations are never approvals."""
import json
import math
import re
from pathlib import Path
from .security import PipelineError, MAX_JSON, read_bytes

SCHEMAS = {
    "wrong-answer-notebook-vision-v1": json.loads(Path(__file__).with_name("vision-v1.schema.json").read_text(encoding="utf-8")),
    "wrong-answer-notebook-vision-v2": json.loads(Path(__file__).with_name("vision-v2.schema.json").read_text(encoding="utf-8")),
}
FORBIDDEN = {"confirmed", "userApproved", "userVerified", "preferredRepresentation", "verificationSource", "verifiedBy", "sha256", "sourceImageHash", "path", "code", "python", "script", "svg", "url", "generatedBy"}

def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise PipelineError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result

def parse_vision(text):
    if len(text.encode("utf-8")) > MAX_JSON:
        raise PipelineError("Analysis exceeds JSON byte limit")
    try:
        value = json.loads(text, object_pairs_hook=pairs, parse_constant=lambda x: (_ for _ in ()).throw(PipelineError(f"Nonfinite JSON: {x}")))
    except (ValueError, RecursionError) as exc:
        raise PipelineError(f"Invalid analysis JSON: {exc}") from exc
    return validate_vision(value)

def load_vision(path):
    return parse_vision(read_bytes(path, MAX_JSON).decode("utf-8-sig"))

def check(value, schema, path="$", depth=0):
    if depth > 40:
        raise PipelineError(f"{path}: nesting limit")
    if "anyOf" in schema:
        for option in schema["anyOf"]:
            try:
                check(value, option, path, depth)
                return
            except PipelineError:
                pass
        raise PipelineError(f"{path}: invalid variant")
    if "const" in schema and value != schema["const"] or "enum" in schema and value not in schema["enum"]:
        raise PipelineError(f"{path}: unsupported value")
    kind = "null" if value is None else "boolean" if isinstance(value, bool) else "integer" if isinstance(value, int) or isinstance(value, float) and math.isfinite(value) and value.is_integer() else "number" if isinstance(value, float) else "string" if isinstance(value, str) else "array" if isinstance(value, list) else "object" if isinstance(value, dict) else "invalid"
    types = schema.get("type", [kind])
    if isinstance(types, str):
        types = [types]
    if kind not in types and not (kind == "integer" and "number" in types):
        raise PipelineError(f"{path}: invalid type")
    if kind in ("integer", "number") and (not math.isfinite(value) or value < schema.get("minimum", -math.inf) or value > schema.get("maximum", math.inf)):
        raise PipelineError(f"{path}: number out of range")
    if kind == "string" and not schema.get("minLength", 0) <= len(value) <= schema.get("maxLength", 100000):
        raise PipelineError(f"{path}: string length")
    if kind == "array":
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", 1000):
            raise PipelineError(f"{path}: array limit")
        for i, child in enumerate(value):
            check(child, schema.get("items", {}), f"{path}[{i}]", depth + 1)
    if kind == "object":
        if len(value) > 100:
            raise PipelineError(f"{path}: object limit")
        props = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                raise PipelineError(f"{path}.{key}: required")
        for key, child in value.items():
            if key in FORBIDDEN or key.startswith("__"):
                raise PipelineError(f"{path}.{key}: forbidden trust/execution field")
            if schema.get("additionalProperties") is False and key not in props:
                raise PipelineError(f"{path}.{key}: unknown field")
            check(child, props.get(key, {}), f"{path}.{key}", depth + 1)
        if set(value) == {"x", "y", "width", "height"}:
            x, y, w, h = (value[k] for k in ("x", "y", "width", "height"))
            if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > 1 or y + h > 1:
                raise PipelineError(f"{path}: rectangle must fit displayed page")

def validate_vision(value):
    if not isinstance(value, dict) or value.get("schemaVersion") not in SCHEMAS:
        raise PipelineError("Unsupported vision schema version")
    version = value["schemaVersion"]
    check(value, SCHEMAS[version])
    def unique(values, path):
        if len(set(values)) != len(values):
            raise PipelineError(f"{path}: duplicate identity")
    unique([s["sourceKey"] for s in value["sources"]], "$.sources")
    unique([e["entryKey"] for e in value["entries"]], "$.entries")
    sources = {s["sourceKey"]: s for s in value["sources"]}
    questions = {}
    for entry in value["entries"]:
        unique([q["questionKey"] for q in entry["questions"]], "$.questions")
        for q in entry["questions"]:
            unique([s["id"] for s in q["contentSegments"]], "$.contentSegments")
            questions[entry["entryKey"], q["questionKey"]] = q
    figures = {}
    for f in value["figures"]:
        identity = (f["entryKey"], f["questionKey"], f["figureKey"])
        if identity in figures or identity[:2] not in questions:
            raise PipelineError("$.figures: duplicate or missing owner")
        figures[identity] = f
    for identity, q in questions.items():
        own = {f[2] for f in figures if f[:2] == identity}
        refs = [s["figureKey"] for s in q["contentSegments"] if s["type"] == "figure"]
        refs += re.findall(r"\[FIGURE:([^\]]+)\]", "\n".join(q["choices"]))
        if set(q["figureKeys"]) != own or set(refs) != own:
            raise PipelineError("$.questions: missing, foreign or unplaced figure reference")
        for reference in [q["source"], *q.get("sourceRefs", [])]:
            validate_source(reference, sources)
    for f in value["figures"]:
        validate_source(f["source"], sources)
    if version == "wrong-answer-notebook-vision-v2":
        for identity, q in questions.items():
            assessment = q["studyAssessment"]
            solution = assessment["solution"]
            scores = assessment["scores"]
            source_answer = assessment["sourceAnswer"]
            for name, score in scores.items():
                if not any(reason.strip() for reason in score["reasons"]):
                    raise PipelineError(f"$.questions[{identity[1]}].studyAssessment.scores.{name}: assessment reason required")
            if assessment["assessmentStatus"] == "unreadable":
                if solution["proposedAnswer"] is not None or any(score["value"] is not None for score in scores.values()):
                    raise PipelineError(f"$.questions[{identity[1]}].studyAssessment: unreadable assessment cannot propose an answer or score")
            status = source_answer["status"]
            source_metadata = {"intent", "notes", "choiceJudgements"}.intersection(source_answer)
            if source_metadata and (status not in ("matched", "conflict", "source_only") or "sourceKey" not in source_answer or "page" not in source_answer):
                raise PipelineError(f"$.questions[{identity[1]}].studyAssessment.sourceAnswer: metadata requires a referenced source answer")
            if assessment["assessmentStatus"] != "solved" and not any(warning.strip() for warning in assessment["warnings"]):
                raise PipelineError(f"$.questions[{identity[1]}].studyAssessment.warnings: incomplete solution reason required")
            if ("sourceKey" in source_answer) != ("page" in source_answer):
                raise PipelineError(f"$.questions[{identity[1]}].studyAssessment.sourceAnswer: sourceKey and page must be paired")
            if status in ("matched", "conflict", "source_only"):
                if not isinstance(source_answer.get("value"), str) or not source_answer["value"].strip():
                    raise PipelineError(f"$.questions[{identity[1]}].studyAssessment.sourceAnswer: source answer value required")
                if "sourceKey" not in source_answer or "page" not in source_answer:
                    raise PipelineError(f"$.questions[{identity[1]}].studyAssessment.sourceAnswer: source reference required")
                validate_source({"sourceKey": source_answer["sourceKey"], "page": source_answer["page"]}, sources)
            elif status == "not_provided" and source_answer["value"] is not None:
                raise PipelineError(f"$.questions[{identity[1]}].studyAssessment.sourceAnswer: not_provided cannot have a value")
            if "sourceKey" in source_answer:
                validate_source({"sourceKey": source_answer["sourceKey"], "page": source_answer["page"]}, sources)
    return value

def validate_source(reference, sources):
    source = sources.get(reference["sourceKey"])
    if source is None or reference["page"] > source.get("pageCount", 10000):
        raise PipelineError("$.source: unknown source or page out of range")
