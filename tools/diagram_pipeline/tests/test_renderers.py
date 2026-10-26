import copy
import io

import pytest
from PIL import Image

from tools.diagram_pipeline.drawing import redraw
from tools.diagram_pipeline.expression import Expression
from tools.diagram_pipeline.pipeline import package, render, verify
from tools.diagram_pipeline.security import PipelineError, json_bytes, load_json


@pytest.mark.parametrize("spec", [
    {"type": "number_line", "points": [{"id": "a", "x": -2, "label": "-2", "open": True}, {"id": "b", "x": 2, "label": "2"}], "intervals": [{"bounds": [-2, 2]}]},
    {"type": "function_graph", "curves": [{"expression": "1/x", "intervals": [[-4, -.01], [.01, 4]]}], "points": [{"id": "hole", "x": 1, "y": 1, "open": True}], "xticks": [-2, 2]},
    {"type": "plane_geometry", "points": [{"id": "a", "x": 0, "y": 2}, {"id": "v", "x": 0, "y": 0}, {"id": "b", "x": 2, "y": 0}], "circles": [{"center": "v", "radius": 2}], "marks": [{"type": "right_angle", "points": ["a", "v", "b"]}]},
    {"type": "table", "pngRequired": True, "rows": [["x", "y"], ["1", "2"]]},
])
def test_renderers_emit_real_nonblank_png(spec):
    content, _ = redraw({**spec, "confirmed": True})
    with Image.open(io.BytesIO(content)) as image:
        image.load()
        assert image.size == (1000, 650)
        assert image.convert("L").getextrema()[0] < 255


@pytest.mark.parametrize("method", ["raster_cleanup", "raster_tracing"])
def test_pixel_transforms_are_review_candidates(reviewed, tmp_path, method):
    path, manifest = reviewed
    manifest["figures"][0]["method"] = method
    path.write_bytes(json_bytes(manifest))
    output = render(path, tmp_path / "rendered")
    result = load_json(tmp_path / "rendered/manifest.json")["figures"][0]["result"]
    assert result["status"] == "needs_review"
    assert result["mathematicalEquivalence"] == "not_proven"
    assert "1gib" in result["resourcePolicy"]
    candidate = tmp_path / "rendered" / result["artifacts"]["cleaned"]["path"]
    candidate.write_bytes(b"damaged")
    with pytest.raises(PipelineError, match="hash mismatch"):
        verify(tmp_path / "rendered/manifest.json")
    assert output["reviewRequired"] is True


def test_ambiguous_or_wrong_labels_never_become_math_pass(reviewed, tmp_path):
    path, manifest = reviewed
    manifest["figures"][0]["spec"]["points"][0]["label"] = "WRONG"
    path.write_bytes(json_bytes(manifest))
    assert render(path, tmp_path / "wrong-label")["mathematicalEquivalence"] == "not_proven"
    manifest["figures"][0]["spec"]["confirmed"] = False
    path.write_bytes(json_bytes(manifest))
    with pytest.raises(PipelineError, match="Generation failed"):
        render(path, tmp_path / "illegible")


def test_missing_placement_blocks_packaging(reviewed, tmp_path):
    path, manifest = reviewed
    manifest["entries"][0]["questions"][0]["contentSegments"] = [{"id": "text", "type": "text", "text": "No known figure location"}]
    manifest["entries"][0]["questions"][0]["choices"] = []
    path.write_bytes(json_bytes(manifest))
    render(path, tmp_path / "unplaced")
    with pytest.raises(PipelineError, match="explicit segment/token"):
        package(tmp_path / "unplaced/manifest.json", tmp_path / "bad.zip")


def test_different_sources_can_share_display_number(reviewed, tmp_path):
    path, manifest = reviewed
    entry = copy.deepcopy(manifest["entries"][0])
    entry["id"] = "exam-b"
    manifest["entries"].append(entry)
    figure = copy.deepcopy(manifest["figures"][0])
    figure.update(id="triangle-b", entryId="exam-b")
    entry["questions"][0]["contentSegments"][1]["figureId"] = "triangle-b"
    entry["questions"][0]["choices"] = ["① [FIGURE:triangle-b]"]
    manifest["figures"].append(figure)
    path.write_bytes(json_bytes(manifest))
    render(path, tmp_path / "two-exams")
    package(tmp_path / "two-exams/manifest.json", tmp_path / "two.zip")
    import json
    import zipfile
    with zipfile.ZipFile(tmp_path / "two.zip") as archive:
        data = json.loads(archive.read("import.json"))["entries"]
    assert [e["questions"][0]["questionNumber"] for e in data] == ["1", "1"]
    assert data[0]["figures"][0]["id"] != data[1]["figures"][0]["id"]


def test_function_evaluator_refuses_large_results():
    with pytest.raises((PipelineError, OverflowError)):
        Expression("exp(10000)")(0)


def test_an_undefined_curve_cannot_succeed_as_an_axes_only_png():
    with pytest.raises(PipelineError, match="no drawable samples"):
        redraw({"type": "function_graph", "confirmed": True, "curves": [{"expression": "log(x)", "intervals": [[-4, -1]]}]})
