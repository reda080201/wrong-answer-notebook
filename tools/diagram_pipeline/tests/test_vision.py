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

@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_shared_contract(case):
    if case["valid"]:
        assert parse_vision(case["text"])["schemaVersion"] == "wrong-answer-notebook-vision-v1"
    else:
        with pytest.raises(PipelineError):
            parse_vision(case["text"])



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
