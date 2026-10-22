import subprocess
import io
from contextlib import closing
from pathlib import Path

import pytest

from tools.diagram_pipeline.pipeline import inspect_input, package, render, run_worker
from tools.diagram_pipeline.security import PipelineError, json_bytes, load_json, relative_path


def vector_pdf(path):
    import pypdfium2 as pdfium
    raw = pdfium.raw
    with pdfium.PdfDocument.new() as document:
        for index in range(2):
            with closing(document.new_page(400, 300)) as page:
                shape = raw.FPDFPageObj_CreateNewPath(30, 30)
                raw.FPDFPath_LineTo(shape, 200, 250)
                raw.FPDFPath_LineTo(shape, 370, 30)
                raw.FPDFPath_Close(shape)
                raw.FPDFPageObj_SetStrokeColor(shape, 0, 0, 0, 255)
                raw.FPDFPageObj_SetStrokeWidth(shape, 2)
                raw.FPDFPath_SetDrawMode(shape, 0, True)
                raw.FPDFPage_InsertObject(page, shape)
                page.gen_content()
                if index == 1:
                    page.set_rotation(90)
        document.save(path)


def test_pdf_vectors_rotated_page_and_figureless_question(tmp_path):
    source = tmp_path / "vectors.pdf"
    vector_pdf(source)
    info = inspect_input(source, tmp_path / "inspect")
    path = Path(info["manifest"])
    data = load_json(path)
    source_id = data["sources"][0]["id"]
    assert data["sources"][0]["pages"][0]["objectCounts"]["2"] > 0
    assert data["sources"][0]["pages"][1]["rotation"] == 90
    data["entries"] = [{"id": "pdf", "questions": [
        {"key": "q1", "number": "1", "questionText": "vector", "contentSegments": [{"id": "t", "type": "text", "text": "vector"}, {"id": "f", "type": "figure", "figureId": "vector"}]},
        {"key": "q2", "number": "2", "questionText": "no figure", "contentSegments": [{"id": "t2", "type": "text", "text": "no figure"}], "source": {"sourceId": source_id, "page": 2, "crop": {"x": 0, "y": 0, "width": 1, "height": .5}}},
    ]}]
    data["figures"] = [{"id": "vector", "entryId": "pdf", "questionKey": "q1", "sourceId": source_id, "page": 1, "method": "auto", "crop": {"x": 0, "y": 0, "width": 1, "height": 1}}]
    reviewed = path.with_name("reviewed.json")
    reviewed.write_bytes(json_bytes(data))
    render(reviewed, tmp_path / "rendered")
    result = load_json(tmp_path / "rendered/manifest.json")
    assert result["figures"][0]["result"]["method"] == "pdf_vector_render"
    assert result["figures"][0]["result"]["mathematicalEquivalence"] == "not_proven"
    package(tmp_path / "rendered/manifest.json", tmp_path / "result.zip")
    import json
    import zipfile
    with zipfile.ZipFile(tmp_path / "result.zip") as archive:
        entry = json.loads(archive.read("import.json"))["entries"][0]
    assert len(entry["sourcePageImages"]) == 2
    assert [q["source"]["page"] for q in entry["questions"]] == [1, 2]
    assert entry["questionSourceCrops"][0]["page"] == 2


@pytest.mark.parametrize("exception", [subprocess.TimeoutExpired("worker", 60), KeyboardInterrupt()])
def test_worker_timeout_and_cancel_terminate_process(monkeypatch, tmp_path, exception):
    class Process:
        killed = False
        calls = 0
        returncode = None
        stderr = io.BytesIO()

        def wait(self, timeout=None):
            self.calls += 1
            if self.calls == 1:
                raise exception
            return None

        def poll(self):
            return None if not self.killed else -1

        def kill(self):
            self.killed = True
    process = Process()

    def popen(command, **kwargs):
        assert kwargs["shell"] is False
        assert isinstance(command, list)
        return process
    monkeypatch.setattr(subprocess, "Popen", popen)
    with pytest.raises((PipelineError, KeyboardInterrupt)):
        run_worker({"action": "test"}, tmp_path, "test")
    assert process.killed


def test_existing_symlink_or_junction_is_rejected(tmp_path):
    import os
    target = tmp_path / "target"
    target.mkdir()
    link = tmp_path / "link"
    if os.name == "nt":
        # A junction needs no developer-mode symlink privilege. Fixed argv, no shell.
        script = "New-Item -ItemType Junction -Path $env:V7_TEST_LINK -Target $env:V7_TEST_TARGET | Out-Null"
        subprocess.run(["powershell", "-NoProfile", "-Command", script], env={**os.environ, "V7_TEST_LINK": str(link), "V7_TEST_TARGET": str(target)}, shell=False, check=True, capture_output=True)
    else:
        link.symlink_to(target, target_is_directory=True)
    with pytest.raises(PipelineError, match="Symlink/reparse"):
        relative_path(tmp_path, "link/image.png")
