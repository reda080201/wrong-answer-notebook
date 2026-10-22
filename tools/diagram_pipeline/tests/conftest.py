from pathlib import Path
import json
import pytest
from PIL import Image, ImageDraw
from tools.diagram_pipeline.image_io import png
from tools.diagram_pipeline.pipeline import inspect_input
from tools.diagram_pipeline.security import json_bytes

@pytest.fixture
def reviewed(tmp_path):
    image = Image.new("RGB", (600, 400), "white")
    draw = ImageDraw.Draw(image)
    draw.line([(60, 300), (300, 60), (540, 300), (60, 300)], fill="black", width=3)
    draw.text((295, 40), "A", fill="black")
    source = tmp_path / "source.png"
    source.write_bytes(png(image))
    info = inspect_input(source, tmp_path / "inspect")
    path = Path(info["manifest"])
    manifest = json.loads(path.read_text("utf-8"))
    manifest["entries"] = [{"id": "exam-a", "title": "Synthetic diagrams", "subject": "수학", "questions": [{"key": "q1", "number": "1", "questionText": "Before. After.", "contentSegments": [{"id": "t1", "type": "text", "text": "Before."}, {"id": "f1", "type": "figure", "figureId": "triangle"}, {"id": "t2", "type": "text", "text": "After."}], "choices": ["① [FIGURE:triangle]", "② none"]}]}]
    manifest["figures"] = [{"id": "triangle", "entryId": "exam-a", "questionKey": "q1", "sourceId": manifest["sources"][0]["id"], "page": 1, "crop": {"x": 0, "y": 0, "width": 1, "height": 1}, "questionCrop": {"x": 0, "y": 0, "width": 1, "height": 1}, "method": "computational_redraw", "spec": {"type": "plane_geometry", "confirmed": True, "points": [{"id": "A", "x": 0, "y": 2, "label": "A"}, {"id": "B", "x": -2, "y": -1, "label": "B"}, {"id": "C", "x": 2, "y": -1, "label": "C"}], "segments": [{"from": "A", "to": "B"}, {"from": "B", "to": "C"}, {"from": "C", "to": "A"}]}}]
    reviewed_path = tmp_path / "inspect" / "reviewed.json"
    reviewed_path.write_bytes(json_bytes(manifest))
    return reviewed_path, manifest


