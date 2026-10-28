"""Build a public synthetic 30-question / 8-figure original-only vision job."""
import argparse
import copy
import json
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw

from tools.diagram_pipeline.image_io import png
from tools.diagram_pipeline.security import digest, json_bytes


def build(out_dir: Path) -> Path:
    if out_dir.exists():
        raise ValueError("Choose a new output directory")
    out_dir.mkdir(parents=True)
    image = Image.new("RGB", (1024, 1024), "white")
    draw = ImageDraw.Draw(image)
    # Eight distinct, explicitly synthetic diagram crops in a 4 x 2 grid.
    figure_numbers = [2, 6, 10, 14, 18, 22, 26, 30]
    figures = []
    for index, number in enumerate(figure_numbers):
        col, row = index % 4, index // 4
        x, y = col * 256, row * 512
        draw.rectangle((x, y, x + 128, y + 128), outline="black", width=3)
        draw.line((x + 16, y + 96, x + 112, y + 32), fill="black", width=5)
        draw.ellipse((x + 59, y + 59, x + 69, y + 69), fill="black")
        draw.text((x + 8, y + 104), f"S{index + 1}", fill="black")
        figures.append({
            "figureKey": f"synthetic-figure-{index + 1}",
            "entryKey": "synthetic-30x8",
            "questionKey": f"question-{number}",
            "source": {
                "sourceKey": "upload-1", "page": 1,
                "rect": {"x": x / 1024, "y": y / 1024, "width": 128 / 1024, "height": 128 / 1024},
            },
            "figureType": "plane_geometry",
            "strategyHint": "preserve_original",
            "observed": {"labels": [f"synthetic-{index + 1}"]},
            "proposedSpec": None, "uncertainties": [], "needsReview": True,
        })
    source = png(image)
    base = json.loads((Path(__file__).parent / "vision-v1.json").read_text("utf-8"))
    base["schemaVersion"] = "wrong-answer-notebook-vision-v2"
    base["document"].update(title="합성 30문항·8그림 원본-only 확인", pageCount=1)
    base["sources"] = [{"sourceKey": "upload-1", "pageCount": 1}]
    entry = copy.deepcopy(base["entries"][0])
    entry.update(entryKey="synthetic-30x8", title="합성 30문항·8그림 원본-only 확인")
    questions = []
    for number in range(1, 31):
        key = f"question-{number}"
        figure = next((item for item in figures if item["questionKey"] == key), None)
        segments = [{"id": f"{key}-text", "type": "text", "text": f"{number}번 합성 문항입니다."}]
        choices = ["① 합성 선택지"]
        figure_keys = []
        if figure:
            segments.append({"id": f"{key}-figure", "type": "figure", "figureKey": figure["figureKey"]})
            choices.append(f"② [FIGURE:{figure['figureKey']}]")
            figure_keys.append(figure["figureKey"])
        questions.append({
            "questionKey": key, "questionNumber": str(number),
            "source": {"sourceKey": "upload-1", "page": 1, "questionRect": {"x": 0, "y": 0, "width": 1, "height": 1}},
            "questionText": f"{number}번 합성 문항입니다.", "contentSegments": segments,
            "choices": choices, "figureKeys": figure_keys, "uncertainties": [],
            "studyAssessment": {
                "stage": "pre_package", "evaluator": "gpt", "assessmentStatus": "solved",
                "solution": {"proposedAnswer": "②", "summary": f"{number}번 합성 풀이", "steps": ["합성 단계"], "strategy": "조건 대조", "selfCheck": "합성 검산", "confidence": 88},
                "scores": {
                    "difficulty": {"value": 72, "confidence": 80, "reasons": ["합성 난이도 근거"]},
                    "importance": {"value": 85, "confidence": 90, "reasons": ["합성 중요도 근거"]},
                },
                "classification": {"subject": "수학", "curriculum": "공통", "unit": "함수", "subunit": "그래프", "concepts": ["합성 개념"], "answerType": "multiple_choice"},
                "learning": {"importantPoints": ["합성 확인점"], "commonTraps": ["합성 오답 유형"], "reviewPoint": "합성 재검토", "candidates": [{"type": "concept", "title": "합성 개념", "content": "합성 fixture 학습 메모", "keywords": ["합성"], "relatedConcepts": ["그래프"]}]},
                "sourceAnswer": {"status": "conflict", "value": "①", "explanation": "합성 원문 답안", "sourceKey": "upload-1", "page": 1, "intent": "합성 출제 의도 메타데이터", "notes": "합성 원문 메모", "choiceJudgements": [{"marker": "①", "text": "합성 선택지 판단"}]},
                "warnings": [],
            },
        })
    entry["questions"] = questions
    analysis = copy.deepcopy(base)
    analysis["entries"] = [entry]
    analysis["figures"] = figures
    analysis["audit"] = {
        "detectedQuestionNumbers": [str(number) for number in range(1, 31)],
        "missingQuestionNumbers": [], "uncertainQuestionNumbers": [],
        "warnings": ["공개 합성 페이지 및 합성 문항·도형. 실제 OCR/수학 정확도 근거가 아님."],
    }
    path = out_dir / "vision-job.zip"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("job.json", json_bytes({"schemaVersion": "vision-import-job-v1", "sources": [{"sourceKey": "upload-1", "filename": "sources/source.png", "sha256": digest(source)}]}))
        archive.writestr("analysis.json", json_bytes(analysis))
        archive.writestr("sources/source.png", source)
    (out_dir / "analysis.json").write_bytes(json_bytes(analysis))
    (out_dir / "source.png").write_bytes(source)
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    print(build(args.out_dir))


if __name__ == "__main__":
    main()
