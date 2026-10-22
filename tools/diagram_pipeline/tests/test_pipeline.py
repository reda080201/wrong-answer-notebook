import json
import zipfile
from pathlib import Path

import pytest
from PIL import Image

from tools.diagram_pipeline.expression import Expression
from tools.diagram_pipeline.image_io import decode, png
from tools.diagram_pipeline.pipeline import package, render
from tools.diagram_pipeline.security import PipelineError, crop_box, json_bytes, relative_path, write_new


def test_real_png_to_reopened_zip(reviewed, tmp_path):
    path, manifest = reviewed
    report = render(path, tmp_path / "rendered")
    assert report["machineChecks"] == "passed"
    assert report["mathematicalEquivalence"] == "not_proven"
    rendered = Path(report["manifest"])
    assert render(path, tmp_path / "rendered")["cached"] is True
    output = tmp_path / "import.zip"
    package(rendered, output)
    with zipfile.ZipFile(output) as archive:
        data = json.loads(archive.read("import.json"))
        entry = data["entries"][0]
        figure = entry["figures"][0]
        assert figure["needsReview"] is True
        assert figure["preferredRepresentation"] == "original"
        assert figure["cleaned"]["image"] != figure["original"]["image"]
        assert entry["questions"][0]["contentSegments"][1]["figureId"] == figure["id"]
        assert figure["id"] in entry["questions"][0]["choices"][0]
        assert entry["questions"][0]["source"]["page"] == 1
        assert entry["questionSourceCrops"][0]["page"] == 1
        for name in archive.namelist():
            if name.endswith(".png"):
                image = decode(archive.read(name), ".png")
                assert image.width > 0 and image.height > 0
                assert min(image.convert("L").getextrema()) < 255


@pytest.mark.parametrize("expression", ["__import__('os')", "x.__class__", "[x for x in range(10)]", "(lambda:1)()", "open('x')", "x[0]", "True", "sin(x, x)", "9" * 300])
def test_expression_rejects_code(expression):
    with pytest.raises(PipelineError):
        Expression(expression)


def test_expression_arithmetic():
    assert Expression("sqrt(x**2)+sin(pi/2)")(-3) == pytest.approx(4)
    with pytest.raises(ValueError):
        Expression("2**100000")(1)


@pytest.mark.parametrize("name", ["../a", "/a", "C:/a", "C:a", "a\\b", "a//b", "a/./b"])
def test_paths(tmp_path, name):
    with pytest.raises(PipelineError):
        relative_path(tmp_path, name)


def test_no_overwrite(tmp_path):
    path = tmp_path / "original.png"
    write_new(path, b"original")
    with pytest.raises(PipelineError):
        write_new(path, b"different")
    assert path.read_bytes() == b"original"


def test_crop_outside():
    with pytest.raises(PipelineError):
        crop_box({"x": .8, "y": 0, "width": .4, "height": 1})


@pytest.mark.parametrize("payload,suffix", [(b"\x89PNG\r\n\x1a\n", ".png"), (b"not image", ".jpg"), (png(Image.new("RGB", (2, 2))), ".webp")])
def test_damaged_images(payload, suffix):
    with pytest.raises(PipelineError):
        decode(payload, suffix)


def test_bad_relation_retains_original(reviewed, tmp_path):
    path, manifest = reviewed
    manifest["figures"][0]["spec"]["marks"] = [{"type": "right_angle", "points": ["A", "B", "C"]}]
    path.write_bytes(json_bytes(manifest))
    with pytest.raises(PipelineError, match="Generation failed"):
        render(path, tmp_path / "failed")
    result = json.loads((tmp_path / "failed/manifest.json").read_text("utf-8"))["figures"][0]["result"]
    assert result["status"] == "failed"
    assert "cleaned" not in result["artifacts"]
    assert (tmp_path / "failed" / result["artifacts"]["original"]["path"]).exists()
    with pytest.raises(PipelineError):
        package(tmp_path / "failed/manifest.json", tmp_path / "bad.zip")
    assert not (tmp_path / "bad.zip").exists()
