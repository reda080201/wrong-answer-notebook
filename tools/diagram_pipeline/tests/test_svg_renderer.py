import hashlib
import json
from pathlib import Path
import zipfile

import pytest
from PIL import ImageChops

from tools.diagram_pipeline.pipeline import inspect_input, render, package, verify
from tools.diagram_pipeline.security import PipelineError, json_bytes
from tools.diagram_pipeline.svg_renderer import inspect_svg, render_svg

SVG = '''<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
<path d="M20 120H220 M20 100L80 50 M140 50L220 100" stroke="black" fill="none" stroke-width="2"/>
<path d="M100 85L120 35L140 85Z" fill="none" stroke="black" stroke-width="2"/>
<circle cx="60" cy="120" r="5" fill="white" stroke="black" stroke-width="2"/>
<circle cx="160" cy="120" r="5" fill="black"/>
<text x="15" y="20" font-size="16">x′ α</text>
<text x="15" y="150" font-size="14">수학</text>
</svg>'''.encode()


def test_actual_graph_geometry_points_labels_and_dimensions():
    image, metadata = render_svg(SVG)
    assert image.size == (240, 160)
    assert metadata["renderer"] == "pymupdf"
    assert metadata["mathematicalEquivalence"] == "not_proven"
    assert min(image.getpixel((60, 120))) > 240  # open point stays open
    assert max(image.getpixel((160, 120))) < 20  # closed point stays closed
    assert min(image.getpixel((120, 50))) > 240  # discontinuous graph stays split
    assert min(image.crop((15, 3, 60, 24)).convert("L").getextrema()) < 80  # prime/Greek labels
    assert min(image.crop((15, 135, 60, 155)).convert("L").getextrema()) < 80  # CJK label ink
    assert min(image.crop((118, 34, 123, 39)).convert("L").getextrema()) < 80
    doubled, _ = render_svg(SVG, dpi=192)
    assert doubled.size == (480, 320)
    assert min(doubled.getpixel((120, 240))) > 240
    assert max(doubled.getpixel((320, 240))) < 20
    again, _ = render_svg(SVG)
    assert ImageChops.difference(image, again).getbbox() is None


@pytest.mark.parametrize("before,after", [(b">x", b">y"), (b'fill="white"', b'fill="black"'), (b'M140 50', b'L140 50')])
def test_changed_label_open_point_or_continuity_is_not_the_same_image(before, after):
    original, _ = render_svg(SVG)
    changed, report = render_svg(SVG.replace(before, after))
    assert ImageChops.difference(original, changed).getbbox() is not None
    assert report["mathematicalEquivalence"] == "not_proven"


@pytest.mark.parametrize("data", [
    b'<svg width="20" height="20"><script/></svg>',
    b'<svg width="20" height="20"><image href="file:///secret.png"/></svg>',
    b'<svg width="20" height="20"><use href="https://example.com/x"/></svg>',
    b'<svg width="20" height="20"><path style="fill:url(https://example.com/x)"/></svg>',
    b'<svg width="20" height="20"><path fill="u\\72l(file:///x)"/></svg>',
    b'<svg width="20" height="20"><foreignObject/></svg>',
    b'<svg width="20" height="20"><g id="x"><use href="#x"/></g></svg>',
    b'<svg width="20" height="20"><defs><clipPath id="clip"><path clip-path="url(#clip)"/></clipPath></defs><path clip-path="url(#clip)"/></svg>',
    b'<svg width="20000" height="20"/>',
    b'<svg width="100%" height="20"/>',
    b'<!DOCTYPE svg [<!ENTITY x "attack">]><svg width="20" height="20">&x;</svg>',
    '<!DOCTYPE svg><svg width="20" height="20"/>'.encode("utf-16"),
    b'<svg>',
])
def test_rejects_external_unsafe_or_excessive_svg(data):
    with pytest.raises(PipelineError):
        render_svg(data)


def test_viewbox_and_physical_units_preserve_viewport():
    assert inspect_svg(b'<svg viewBox="10 20 240 160"/>')["width"] == 240
    image, _ = render_svg(b'<svg width="1in" height="0.5in" viewBox="0 0 100 50"><path d="M0 25H100" stroke="black"/></svg>')
    assert image.size == (96, 48)
    assert min(image.getpixel((48, 24))) < 200


def test_svg_source_to_actual_import_zip_preserves_source_and_crop(tmp_path):
    source = tmp_path / "graph.svg"
    source.write_bytes(SVG)
    info = inspect_input(source, tmp_path / "inspected")
    path = Path(info["manifest"])
    manifest = json.loads(path.read_text("utf-8"))
    manifest["entries"] = [{"id": "sheet", "title": "SVG regression", "subject": "수학", "questions": [{"key": "q1", "number": "1", "questionText": "Before [FIGURE:graph] After", "choices": ["① [FIGURE:graph]"]}]}]
    manifest["figures"] = [{"id": "graph", "entryId": "sheet", "questionKey": "q1", "sourceId": manifest["sources"][0]["id"], "page": 1, "crop": {"x": 0, "y": 0, "width": .5, "height": 1}, "method": "auto"}]
    path.write_bytes(json_bytes(manifest))
    result = render(path, tmp_path / "rendered")
    rendered = Path(result["manifest"])
    saved = json.loads(rendered.read_text("utf-8"))
    assert source.read_bytes() == SVG
    assert (rendered.parent / saved["sources"][0]["path"]).read_bytes() == SVG
    figure = saved["figures"][0]
    assert figure["result"]["artifacts"]["original"]["width"] == 120
    assert figure["result"]["artifacts"]["cleaned"]["width"] == 120
    assert verify(rendered)["machineChecks"] == "passed"
    output = tmp_path / "import.zip"
    package(rendered, output)
    with zipfile.ZipFile(output) as archive:
        entry = json.loads(archive.read("import.json"))["entries"][0]
        assert entry["figures"][0]["preferredRepresentation"] == "original"
        assert entry["figures"][0]["cleaned"]["generatedBy"] == "svg_render"
        assert "[FIGURE:" in entry["questions"][0]["choices"][0]


def test_svg_candidate_is_bound_to_bytes_and_verified(reviewed, tmp_path):
    path, manifest = reviewed
    candidate = path.parent / "candidate.svg"
    candidate.write_bytes(SVG)
    manifest["figures"][0].update(method="svg_render", svg={"path": "candidate.svg", "sha256": hashlib.sha256(SVG).hexdigest()})
    path.write_bytes(json_bytes(manifest))
    result = render(path, tmp_path / "output")
    assert verify(Path(result["manifest"]))["machineChecks"] == "passed"
    candidate.write_bytes(SVG.replace(b">x", b">y"))
    with pytest.raises(PipelineError, match="SVG candidate hash"):
        render(path, tmp_path / "another-output")
    assert (path.parent / manifest["sources"][0]["path"]).exists()


def test_runtime_lock_has_no_cairo_scikit_or_test_dependencies():
    locked = (Path(__file__).parents[1] / "requirements.runtime.lock").read_text("utf-8").lower()
    assert "pymupdf==1.28.2" in locked
    for package_name in ("cairosvg==", "scikit-image==", "pytest==", "ruff=="):
        assert package_name not in locked


def test_existing_internal_generation_hash_stays_compatible():
    from tools.diagram_pipeline.pipeline import generation_input_hash
    from tools.diagram_pipeline.security import digest
    source = {"sha256": "original-hash"}
    figure = {"page": 1, "crop": {"x": 0, "y": 0, "width": 1, "height": 1}, "method": "original"}
    old = {"sourceSha256": source["sha256"], **{key: figure.get(key) for key in ("page", "crop", "questionCrop", "method", "spec", "parameters")}}
    assert generation_input_hash(source, figure) == digest(json_bytes(old))


def test_fractional_viewport_never_stretches_axes_independently(monkeypatch):
    import pymupdf
    real = pymupdf.Page.get_pixmap
    observed = []
    def capture(page, *args, **kwargs):
        matrix = kwargs["matrix"]
        observed.append((matrix.a, matrix.d))
        return real(page, *args, **kwargs)
    monkeypatch.setattr(pymupdf.Page, "get_pixmap", capture)
    image, _ = render_svg(b'<svg width="240.25" height="160.5"><circle cx="40" cy="40" r="20" stroke="black" fill="none"/></svg>', dpi=192)
    assert image.size == (481, 321)
    assert observed and all(x == y for x, y in observed)
