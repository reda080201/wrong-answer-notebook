"""Reproducible synthetic evidence; never described as a real exam extraction."""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw

from tools.diagram_pipeline.image_io import png
from tools.diagram_pipeline.pipeline import inspect_input
from tools.diagram_pipeline.security import json_bytes, load_json, write_new


def create_demo(out):
    image = Image.new("RGB", (1800, 600), "white")
    draw = ImageDraw.Draw(image)
    draw.line((60, 300, 540, 300), fill="black", width=3)
    draw.line((180, 300, 420, 300), fill="gray", width=8)
    draw.ellipse((173, 293, 187, 307), fill="white", outline="black", width=2)
    draw.ellipse((413, 293, 427, 307), fill="black")
    draw.text((173, 320), "-2", fill="black")
    draw.text((413, 320), "2", fill="black")
    draw.polygon([(900, 100), (720, 450), (1080, 450)], outline="black", width=3)
    for x, y, name in [(900, 75, "A"), (700, 455, "B"), (1090, 455, "C")]:
        draw.text((x, y), name, fill="black")
    draw.line((1260, 470, 1740, 470), fill="black", width=2)
    draw.line((1500, 550, 1500, 70), fill="black", width=2)
    draw.line([(1500 + int(x * 90), 470 - int(x * x * 80)) for x in [i / 100 for i in range(-200, 201)]], fill="black", width=3)
    source = out / "source.png"
    write_new(source, png(image))
    inspected = inspect_input(source, out / "inspected")
    manifest = load_json(Path(inspected["manifest"]))
    specifications = [
        {"type": "number_line", "xlim": [-4, 4], "ylim": [-1, 1], "points": [{"id": "a", "x": -2, "label": "-2", "open": True}, {"id": "b", "x": 2, "label": "2", "open": False}], "intervals": [{"bounds": [-2, 2]}]},
        {"type": "plane_geometry", "points": [{"id": "A", "x": 0, "y": 2, "label": "A"}, {"id": "B", "x": -2, "y": -1, "label": "B"}, {"id": "C", "x": 2, "y": -1, "label": "C"}], "segments": [{"from": "A", "to": "B"}, {"from": "B", "to": "C"}, {"from": "C", "to": "A"}]},
        {"type": "function_graph", "xlim": [-3, 3], "ylim": [-1, 5], "xticks": [-2, -1, 1, 2], "yticks": [1, 4], "curves": [{"expression": "x**2", "intervals": [[-2, 2]]}], "labels": [{"x": 1.6, "y": 4.2, "text": "$y=x^2$"}]},
    ]
    questions, figures = [], []
    for i, spec in enumerate(specifications):
        key = f"q{i+1}"
        figure_id = f"diagram-{i+1}"
        crop = {"x": i / 3, "y": 0, "width": 1 / 3, "height": 1}
        questions.append({"key": key, "number": str(i+1), "questionText": "다음 그림을 보고 답하세요.", "contentSegments": [{"id": key+"-before", "type": "text", "text": "다음 그림을 보고 답하세요."}, {"id": key+"-figure", "type": "figure", "figureId": figure_id}, {"id": key+"-after", "type": "text", "text": "그림 뒤 문장입니다."}], "choices": [f"① [FIGURE:{figure_id}]", "② 해당 없음"]})
        figures.append({"id": figure_id, "entryId": "synthetic-exam", "questionKey": key, "sourceId": manifest["sources"][0]["id"], "page": 1, "crop": crop, "questionCrop": crop, "method": "computational_redraw", "spec": {**spec, "confirmed": True}})
    manifest["entries"] = [{"id": "synthetic-exam", "title": "합성 확인용 · 수직선·기하·그래프", "subject": "수학", "template": {"answerKey": [{"id": f"a{i}", "questionNumber": str(i), "answer": "①", "explanation": "합성 확인용 해설"} for i in range(1, 4)]}, "questions": questions}]
    manifest["figures"] = figures
    target = Path(inspected["manifest"]).with_name("reviewed.json")
    write_new(target, json_bytes(manifest))
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, required=True)
    print(create_demo(parser.parse_args().out_dir))
