import json
import zipfile
from pathlib import Path
import pytest
from PIL import Image
from tools.diagram_pipeline.security import PipelineError
from tools.diagram_pipeline.vision_schema import parse_vision
from tools.diagram_pipeline.vision_adapter import run_vision, unpack_job
from tools.diagram_pipeline.drawing import redraw, preview_redraw
from tools.diagram_pipeline.examples.create_vision_demo import job

EXAMPLES = Path(__file__).parents[1] / "examples"
CASES = json.loads((EXAMPLES / "vision-parity.json").read_text("utf-8"))
V2_CASES = json.loads((Path(__file__).parent / "fixtures" / "vision-v2-cases.json").read_text("utf-8"))

@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_shared_contract(case):
    if case["valid"]:
        assert parse_vision(case["text"])["schemaVersion"] == "wrong-answer-notebook-vision-v1"
    else:
        with pytest.raises(PipelineError):
            parse_vision(case["text"])


@pytest.mark.parametrize("case", V2_CASES, ids=lambda c: c["name"])
def test_shared_v2_contract(case):
    if case["valid"]:
        assert parse_vision(case["text"])["schemaVersion"] == "wrong-answer-notebook-vision-v2"
    else:
        with pytest.raises(PipelineError):
            parse_vision(case["text"])


def synthetic_v2():
    value = json.loads((EXAMPLES / "vision-v1.json").read_text("utf-8"))
    value["schemaVersion"] = "wrong-answer-notebook-vision-v2"
    value["entries"][0]["questions"][0]["studyAssessment"] = {
        "stage": "pre_package", "evaluator": "gpt", "assessmentStatus": "solved",
        "solution": {"proposedAnswer": "②", "summary": "합성 풀이", "steps": ["합성 단계"], "strategy": "대입", "selfCheck": "확인", "confidence": 88},
        "scores": {"difficulty": {"value": 72, "confidence": 80, "reasons": ["개념 적용"]}, "importance": {"value": 85, "confidence": 90, "reasons": ["핵심 개념"]}},
        "classification": {"subject": "수학", "curriculum": "공통", "unit": "함수", "subunit": "부등식", "concepts": ["범위"], "answerType": "multiple_choice"},
        "learning": {"importantPoints": ["끝점 확인"], "commonTraps": ["부등호 방향"], "reviewPoint": "끝점 재검토"},
        "sourceAnswer": {"status": "conflict", "value": "①", "explanation": "합성 답지 설명", "sourceKey": "upload-1", "page": 1}, "warnings": []
    }
    return value


def test_v2_semantics_reject_unreadable_answer_and_invalid_source_answer():
    value = synthetic_v2()
    q = value["entries"][0]["questions"][0]
    q["studyAssessment"]["assessmentStatus"] = "unreadable"
    q["studyAssessment"]["warnings"] = ["문항 판독 불가"]
    with pytest.raises(PipelineError, match="unreadable"):
        parse_vision(json.dumps(value))
    value = synthetic_v2()
    q = value["entries"][0]["questions"][0]
    q["studyAssessment"]["sourceAnswer"].update(status="source_only", sourceKey="missing")
    with pytest.raises(PipelineError, match="unknown source"):
        parse_vision(json.dumps(value))
    value = synthetic_v2()
    value["entries"][0]["questions"][0]["studyAssessment"]["scores"]["difficulty"].update(value=None, reasons=[""])
    with pytest.raises(PipelineError, match="assessment reason required"):
        parse_vision(json.dumps(value))


def test_v2_mapping_preserves_assessment_and_prefers_source_answer(tmp_path):
    value = synthetic_v2()
    value["entries"][0]["questions"][0]["studyAssessment"]["sourceAnswer"].update(sourceKey="upload-2", page=2)
    result = run_vision(job(tmp_path, value, multi=True), tmp_path / "run")
    with zipfile.ZipFile(tmp_path / "run/output-import-v2.zip") as archive:
        entry = json.loads(archive.read("import.json"))["entries"][0]
    q = entry["questions"][0]
    answer = entry["answerKey"][0]
    meta = entry["questionMeta"][0]
    assert answer["answerProvenance"] == {"kind": "conflict", "proposedAnswer": "②", "independent": False}
    assert answer["answer"] == "①"
    assert answer["needsReview"] is True
    assert "studyAssessment" not in answer
    assert meta["studyAssessment"]["solution"]["proposedAnswer"] == "②"
    assert q.get("studyAssessment") is None
    assert answer["sourceNote"] == "원문 답안과 AI 예상 답이 다릅니다. 정답을 확인하세요. · 원본 자료 2페이지"
    assert meta["difficultyScore"] == 72
    assert meta["rating"]["importanceScore"] == 85
    assert meta["rating"]["evaluationSource"] == "imported"
    assert meta["rating"]["lastEvaluatedAt"] == meta["updatedAt"]
    assert meta["important"] is True
    assert len(entry["sourcePageImages"]) == 2
    assert q["source"]["page"] == 1
    assert "answerSourceRef" not in q
    assert result["verification"]["mathematicalEquivalence"] == "not_proven"



@pytest.mark.parametrize("multi", [False, True])
def test_automatic_real_png_zip(tmp_path, multi):
    result = run_vision(job(tmp_path, multi=multi), tmp_path / "run")
    assert result["verification"]["mathematicalEquivalence"] == "not_proven"
    with zipfile.ZipFile(tmp_path / "run/output-import-v2.zip") as archive:
        data = json.loads(archive.read("import.json"))
        assert len(data["entries"]) == (2 if multi else 1)
        for entry in data["entries"]:
            figure = entry["figures"][0]
            assert figure["preferredRepresentation"] == "original"
            assert figure["needsReview"] is True
            assert entry["questions"][0]["contentSegments"][1]["figureId"] == figure["id"]
            for representation in ("original", "cleaned"):
                with Image.open(__import__("io").BytesIO(archive.read(figure[representation]["image"]))) as image:
                    image.load()
                    assert image.width > 0
        if multi:
            assert len(data["entries"][1]["sourcePageImages"]) == 2
            assert data["entries"][0]["figures"][0]["id"] != data["entries"][1]["figures"][0]["id"]


def test_no_figure_question(tmp_path):
    value = json.loads((EXAMPLES / "vision-v1.json").read_text("utf-8"))
    value["figures"] = []
    q = value["entries"][0]["questions"][0]
    q["contentSegments"] = q["contentSegments"][:1]
    q["figureKeys"] = []
    run_vision(job(tmp_path, value), tmp_path / "run")
    assert (tmp_path / "run/output-import-v2.zip").exists()


def test_null_number_requires_explicit_review(tmp_path):
    value = json.loads((EXAMPLES / "vision-v1.json").read_text("utf-8"))
    value["entries"][0]["questions"][0]["questionNumber"] = None
    with pytest.raises(PipelineError, match="blocked questions"):
        run_vision(job(tmp_path, value), tmp_path / "run")
    assert (tmp_path / "run/prepared/adapter-report.json").exists()
    assert not (tmp_path / "run/output-import-v2.zip").exists()


def test_unconfirmed_preview_is_not_human_confirmation():
    spec = {"type": "number_line", "points": [{"id": "a", "x": -2, "y": 0, "open": True}, {"id": "b", "x": 2, "y": 0, "open": False}]}
    with pytest.raises(PipelineError):
        redraw(spec)
    content, messages = preview_redraw(spec)
    assert content.startswith(b"\x89PNG")
    assert any("not proven" in message for message in messages)
    assert "confirmed" not in spec


def test_job_rejects_traversal(tmp_path):
    path = tmp_path / "bad.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("../outside", "bad")
    with pytest.raises(PipelineError):
        unpack_job(path, tmp_path / "out")
    assert not (tmp_path / "outside").exists()


def test_preview_failure_keeps_original_and_packages(tmp_path):
    value = json.loads((EXAMPLES / "vision-v1.json").read_text("utf-8"))
    value["figures"][0].update(strategyHint="propose_computational_redraw", proposedSpec={"type": "function_graph", "curves": [{"expression": "__import__('os')", "intervals": [[-1, 1]]}]})
    run_vision(job(tmp_path, value), tmp_path / "run")
    manifest = json.loads((tmp_path / "run/rendered/manifest.json").read_text("utf-8"))
    result = manifest["figures"][0]["result"]
    assert result["status"] == "original_fallback"
    assert result["generationState"] == "failed"
    assert "cleaned" not in result["artifacts"]
    assert "original" in result["artifacts"]
    assert (tmp_path / "run/output-import-v2.zip").exists()


def test_explicit_exclusion_resolves_a_duplicate_without_dropping_the_other_question(tmp_path):
    import copy
    value = json.loads((EXAMPLES / "vision-v1.json").read_text("utf-8"))
    other = copy.deepcopy(value["entries"][0]["questions"][0])
    other.update(questionKey="other", figureKeys=[], contentSegments=[{"id": "text", "type": "text", "text": "Other printed number one"}])
    value["entries"][0]["questions"].append(other)
    run_vision(job(tmp_path, value), tmp_path / "run", ["synthetic-exam/other"])
    with zipfile.ZipFile(tmp_path / "run/output-import-v2.zip") as archive:
        data = json.loads(archive.read("import.json"))
        assert len(data["entries"][0]["questions"]) == 1
        assert data["entries"][0]["questions"][0]["questionNumber"] == "1"


def test_preview_does_not_silently_ignore_closed_endpoint_or_unknown_style():
    with pytest.raises(PipelineError, match="Unsupported preview points"):
        preview_redraw({"type": "number_line", "points": [{"id": "p", "x": 2, "closed": False}]})
    with pytest.raises(PipelineError, match="line style"):
        preview_redraw({"type": "function_graph", "curves": [{"expression": "x", "intervals": [[-1, 1]], "style": "invisible"}]})
