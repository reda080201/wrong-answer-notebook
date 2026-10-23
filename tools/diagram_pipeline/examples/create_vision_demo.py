"""Create a public synthetic vision job; this does not claim real OCR."""
import argparse
from pathlib import Path
import copy
import json
import zipfile
from PIL import Image, ImageDraw
from tools.diagram_pipeline.security import digest, json_bytes

EXAMPLES = Path(__file__).parent


def job(tmp_path, analysis=None, multi=False):
    from tools.diagram_pipeline.image_io import png
    image = Image.new("RGB", (800, 600), "white")
    draw = ImageDraw.Draw(image)
    draw.line((160, 125, 640, 125), fill="black", width=3)
    draw.ellipse((270, 120, 280, 130), outline="black", width=2)
    draw.ellipse((520, 120, 530, 130), fill="black")
    draw.text((265, 141), "-2", fill="black")
    draw.text((520, 141), "2", fill="black")
    draw.text((60, 50), "1. Number line (synthetic diagram)", fill="black")
    content = png(image)
    value = copy.deepcopy(analysis or json.loads((EXAMPLES / "vision-v1.json").read_text("utf-8")))
    value["audit"]["warnings"] = ["Locally generated synthetic number-line source, points and numeric labels. Not a real exam OCR result; source body OCR accuracy is not measured."]
    sources = [{"sourceKey": "upload-1", "filename": "sources/source.png", "sha256": digest(content)}]
    assets = {"sources/source.png": content}
    if multi:
        import pymupdf
        document = pymupdf.open()
        for _ in range(2):
            page = document.new_page(width=800, height=600)
            page.insert_image(page.rect, stream=content)
        pdf = document.tobytes()
        assets["sources/multi.pdf"] = pdf
        sources.append({"sourceKey": "upload-2", "filename": "sources/multi.pdf", "sha256": digest(pdf)})
        value["sources"].append({"sourceKey": "upload-2", "pageCount": 2})
        second = copy.deepcopy(value["entries"][0])
        second["entryKey"] = "second-exam"
        second["questions"][0]["source"] = {"sourceKey": "upload-2", "page": 1}
        second["questions"][0]["sourceRefs"] = [{"sourceKey": "upload-2", "page": 2}]
        value["entries"].append(second)
        figure = copy.deepcopy(value["figures"][0])
        figure["entryKey"] = "second-exam"
        figure["source"].update(sourceKey="upload-2", page=2)
        value["figures"].append(figure)
    path = tmp_path / "vision-job.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("job.json", json_bytes({"schemaVersion": "vision-import-job-v1", "sources": sources}))
        archive.writestr("analysis.json", json_bytes(value))
        for name, data in assets.items():
            archive.writestr(name, data)
    return path



def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--multi", action="store_true")
    args = parser.parse_args()
    if args.out_dir.exists():
        raise ValueError("Choose a new output directory")
    args.out_dir.mkdir(parents=True)
    print(job(args.out_dir, multi=args.multi))


if __name__ == "__main__":
    main()
