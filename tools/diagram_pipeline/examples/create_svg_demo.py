"""Actual synthetic SVG evidence -> PNG -> ordinary external Import-v2 ZIP."""
import argparse
import json
from pathlib import Path

from tools.diagram_pipeline.pipeline import inspect_input
from tools.diagram_pipeline.security import json_bytes, write_new

SVG = '''<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300" viewBox="0 0 900 300">
<g fill="none" stroke="black" stroke-width="2">
<path d="M20 230H280 M45 260V35 M65 200L130 80 M175 80L260 200"/>
<path d="M330 230L450 50L570 230Z M450 230V50"/>
<path d="M650 160H865 M700 160V150 M820 160V150 M700 150H820"/>
</g>
<circle cx="130" cy="80" r="5" fill="white" stroke="black" stroke-width="2"/>
<circle cx="175" cy="80" r="5" fill="black"/>
<circle cx="700" cy="160" r="5" fill="white" stroke="black" stroke-width="2"/>
<circle cx="820" cy="160" r="5" fill="black"/>
<g font-size="18"><text x="30" y="25">함수 f′(x)</text><text x="132" y="68">α</text><text x="265" y="252">x</text><text x="440" y="35">A</text><text x="318" y="253">B</text><text x="562" y="253">C</text><text x="690" y="192">−2</text><text x="815" y="192">2</text><text x="680" y="40">수직선</text></g>
</svg>'''.encode("utf-8")


def create(out):
    source = out / "evidence.svg"
    write_new(source, SVG)
    info = inspect_input(source, out / "inspected")
    path = Path(info["manifest"])
    manifest = json.loads(path.read_text("utf-8"))
    questions, figures = [], []
    for index, title in enumerate(("불연속 그래프", "평면 도형", "열린점과 닫힌점")):
        key = f"q{index + 1}"
        identity = f"figure-{index + 1}"
        questions.append({"key": key, "number": str(index + 1), "questionText": f"{title}의 원본과 정리본을 비교하세요.", "contentSegments": [{"id": f"before-{key}", "type": "text", "text": title}, {"id": f"image-{key}", "type": "figure", "figureId": identity}, {"id": f"after-{key}", "type": "text", "text": "라벨과 점의 연결을 확인하세요."}], "choices": [f"① [FIGURE:{identity}]", "② 원본 유지"]})
        figures.append({"id": identity, "title": title, "entryId": "svg-demo", "questionKey": key, "sourceId": manifest["sources"][0]["id"], "page": 1, "crop": {"x": index / 3, "y": 0, "width": 1 / 3, "height": 1}, "method": "auto"})
    manifest["entries"] = [{"id": "svg-demo", "title": "SVG 렌더러 확인용 합성 문제지", "subject": "수학", "questions": questions}]
    manifest["figures"] = figures
    reviewed = path.with_name("reviewed.json")
    write_new(reviewed, json_bytes(manifest))
    return {"manifest": str(reviewed), "source": str(source), "synthetic": True}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, required=True)
    print(json.dumps(create(parser.parse_args().out_dir)))
