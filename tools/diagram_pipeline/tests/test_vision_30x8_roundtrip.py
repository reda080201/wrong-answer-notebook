"""Coverage for the synthetic 30-question / 8-figure CLI original-only package."""
import io
import json
import zipfile

from PIL import Image

from tools.diagram_pipeline.examples.create_vision_30x8_demo import build
from tools.diagram_pipeline.vision_adapter import run_vision


def test_30_questions_8_original_only_figures_survive_cli_package(tmp_path):
    job = build(tmp_path / "input")
    result = run_vision(job, tmp_path / "output")
    assert result["verification"]["mathematicalEquivalence"] == "not_proven"
    with zipfile.ZipFile(tmp_path / "output" / "output-import-v2.zip") as archive:
        package = json.loads(archive.read("import.json"))
        entry = package["entries"][0]
        assert [question["questionNumber"] for question in entry["questions"]] == [str(n) for n in range(1, 31)]
        assert len(entry["answerKey"]) == 30
        assert len(entry["questionMeta"]) == 30
        assert len(entry["learningBlocks"]) == 30
        assert len(entry["figures"]) == 8
        assert len(entry["sourcePageImages"]) == 1
        assert all(figure["preferredRepresentation"] == "original" for figure in entry["figures"])
        assert all("cleaned" not in figure for figure in entry["figures"])
        assert all(answer["answerProvenance"] == {"kind": "conflict", "proposedAnswer": "②", "independent": False} for answer in entry["answerKey"])
        assert all(answer["answer"] == "①" and answer["intent"] == "합성 출제 의도 메타데이터" and answer["notes"] == "합성 원문 메모" for answer in entry["answerKey"])
        assert all(answer["choiceJudgements"] == [{"marker": "①", "text": "합성 선택지 판단"}] for answer in entry["answerKey"])
        assert all(meta["difficultyScore"] == 72 and meta["rating"]["importanceScore"] == 85 for meta in entry["questionMeta"])
        assert all(meta["studyAssessment"]["sourceAnswer"]["status"] == "conflict" for meta in entry["questionMeta"])
        assert all(block["content"] == "합성 fixture 학습 메모" and block["reviewStatus"] == "draft" for block in entry["learningBlocks"])
        for figure in entry["figures"]:
            with Image.open(io.BytesIO(archive.read(figure["original"]["image"]))) as image:
                image.load()
                assert image.size == (128, 128)
        assert [question["questionNumber"] for question in entry["questions"] if any(s["type"] == "figure" for s in question["contentSegments"])] == ["2", "6", "10", "14", "18", "22", "26", "30"]
