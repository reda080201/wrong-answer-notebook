"""Exercise the actual portable renderer from an unrelated cwd and minimal PATH."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import zipfile

from .examples.create_svg_demo import SVG
from .security import PipelineError, json_bytes, plain_path, write_new


def verify_runtime(bundle, out):
    if os.name != "nt":
        raise PipelineError("Portable runtime validation requires Windows")
    bundle, out = plain_path(bundle).resolve(), plain_path(out).resolve()
    if out.exists():
        raise PipelineError("Choose a new verification directory")
    out.mkdir(parents=True)
    environment = {**os.environ, "PATH": str(Path(os.environ["SystemRoot"]) / "System32"), "PYTHONPATH": "untrusted", "PYTHONHOME": "untrusted"}
    cwd = out / "foreign-cwd"
    (cwd / "tools").mkdir(parents=True)
    write_new(cwd / "tools" / "__init__.py", b'raise RuntimeError("Untrusted cwd was imported")\n')
    python = str(bundle / "runtime" / "python.exe")
    runner = str(bundle / "run_pipeline.py")
    timings = {}

    def invoke(name, *args):
        start = time.perf_counter()
        result = subprocess.run([python, "-I", runner, *map(str, args)], cwd=cwd, env=environment, capture_output=True, text=True, encoding="utf-8", timeout=180, creationflags=subprocess.CREATE_NO_WINDOW)
        timings[name] = round(time.perf_counter() - start, 3)
        if result.returncode:
            raise PipelineError(f"Packaged {name} failed: {result.stderr[-4000:]}")
        return json.loads(result.stdout)

    # This is not a claim about every possible machine: no GTK/Cairo is copied,
    # available on PATH, or imported in this isolated deployment probe.
    module_check = subprocess.run([python, "-I", "-c", "import importlib.util,json,pymupdf; print(json.dumps({'pymupdf':pymupdf.VersionBind,'cairo':importlib.util.find_spec('cairosvg') is not None,'skimage':importlib.util.find_spec('skimage') is not None}))"], cwd=cwd, env=environment, capture_output=True, text=True, timeout=30, creationflags=subprocess.CREATE_NO_WINDOW)
    if module_check.returncode:
        raise PipelineError("Packaged native PyMuPDF import failed")
    modules = json.loads(module_check.stdout)
    if modules["cairo"] or modules["skimage"]:
        raise PipelineError("Probe unexpectedly includes an excluded dependency")
    source = out / "source.svg"
    write_new(source, SVG)
    inspected = invoke("inspect", "inspect", "--input", source, "--out-dir", out / "inspected")
    manifest_path = Path(inspected["manifest"])
    manifest = json.loads(manifest_path.read_text("utf-8"))
    manifest["entries"] = [{"id": "portable", "title": "Portable SVG probe", "subject": "수학", "questions": [{"key": "q1", "number": "1", "questionText": "Before [FIGURE:graph] After", "choices": ["① [FIGURE:graph]"]}]}]
    manifest["figures"] = [{"id": "graph", "entryId": "portable", "questionKey": "q1", "sourceId": manifest["sources"][0]["id"], "page": 1, "crop": {"x": 0, "y": 0, "width": 1, "height": 1}, "method": "auto"}]
    reviewed = manifest_path.with_name("reviewed.json")
    write_new(reviewed, json_bytes(manifest))
    generated = invoke("render", "render", "--manifest", reviewed, "--out-dir", out / "rendered")
    checked = invoke("verify", "verify", "--manifest", generated["manifest"])
    invoke("package", "package", "--manifest", generated["manifest"], "--output", out / "import-v2.zip")
    if checked["machineChecks"] != "passed" or checked["mathematicalEquivalence"] != "not_proven" or source.read_bytes() != SVG:
        raise PipelineError("Portable rendering changed evidence or trust policy")
    with zipfile.ZipFile(out / "import-v2.zip") as archive:
        entry = json.loads(archive.read("import.json"))["entries"][0]
        if entry["figures"][0]["preferredRepresentation"] != "original":
            raise PipelineError("Portable output auto-approved a candidate")
    report = {"nativeImport": modules, "isolatedPath": True, "unrelatedCwd": True, "systemPythonUsed": False, "gtkCairoInstalledByProbe": False, "timingsSeconds": timings, "machineChecks": "passed", "mathematicalEquivalence": "not_proven", "releaseApproved": False, "installedAppTested": False}
    write_new(out / "verification-report.json", json_bytes(report))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify_runtime(args.bundle, args.out_dir)))
    except (PipelineError, OSError, subprocess.TimeoutExpired) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(2)
