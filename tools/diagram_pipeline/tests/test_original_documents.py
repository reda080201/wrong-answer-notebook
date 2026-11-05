import json
import zipfile

import pymupdf

from tools.diagram_pipeline.vision_adapter import run_vision
from tools.diagram_pipeline.security import digest
from tools.diagram_pipeline.tests.test_vision import synthetic_v2


def test_pdf_job_preserves_trailing_bytes_and_source_identity(tmp_path):
    originals = []
    for marker, rotation in (("question", 90), ("answer", 0)):
        with pymupdf.open() as pdf:
            page = pdf.new_page(width=120, height=160)
            page.set_rotation(rotation)
            page.insert_text((15, 30), marker)
            originals.append(pdf.tobytes() + f"\n% {marker} preserved tail\n".encode())
    observation = synthetic_v2()
    observation["sources"] = [{"sourceKey": "upload-1", "pageCount": 1}, {"sourceKey": "upload-2", "pageCount": 1}]
    observation["document"]["pageCount"] = 2
    observation["figures"] = []
    question = observation["entries"][0]["questions"][0]
    question["figureKeys"] = []
    question["contentSegments"] = [{"id": "text", "type": "text", "text": "synthetic question"}]
    question["choices"] = ["① first", "② second"]
    question["studyAssessment"]["sourceAnswer"].update(sourceKey="upload-2", page=1)
    sources = [
        {"sourceKey": f"upload-{index}", "filename": f"sources/upload-{index}.pdf",
         "originalName": "same.pdf", "sha256": digest(data)}
        for index, data in enumerate(originals, 1)
    ]
    job = tmp_path / "job.zip"
    with zipfile.ZipFile(job, "w") as archive:
        archive.writestr("job.json", json.dumps({"schemaVersion": "vision-import-job-v1", "sources": sources}))
        archive.writestr("analysis.json", json.dumps(observation))
        for source, raw in zip(sources, originals, strict=True):
            archive.writestr(source["filename"], raw)
    result = run_vision(job, tmp_path / "output")
    with zipfile.ZipFile(result["zip"]) as archive:
        entry = json.loads(archive.read("import.json"))["entries"][0]
        docs = entry["originalDocuments"]
        assert [doc["sourceKey"] for doc in docs] == ["upload-1", "upload-2"]
        assert [doc["filename"] for doc in docs] == ["same.pdf", "same.pdf"]
        for doc, raw in zip(docs, originals, strict=True):
            asset = archive.read(f"original-documents-v1/{doc['originalAssetId']}")
            assert asset == raw
            assert digest(asset) == doc["sha256"]
            assert doc["byteLength"] == len(raw)
            assert doc["pages"][0]["physicalPage"] == 1
            assert doc["pages"][0]["sourcePageImage"] in entry["sourcePageImages"]
