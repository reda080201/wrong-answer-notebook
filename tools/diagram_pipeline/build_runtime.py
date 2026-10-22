"""Build a NON-RELEASE Windows runtime probe, never modify the installed app.

Licensing/distribution approval is intentionally not inferred from a successful build.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import struct
import sys

from .security import PipelineError, plain_path


def copy_tree(source, target, *, excluded=frozenset()):
    source = plain_path(source)
    target.mkdir(parents=True, exist_ok=False)
    for child in source.iterdir():
        if child.name in excluded or child.name == "__pycache__":
            continue
        plain_path(child)
        if child.is_dir():
            copy_tree(child, target / child.name, excluded=excluded)
        elif child.is_file():
            shutil.copy2(child, target / child.name)


def build(python_home, out, wheelhouse=None):
    if os.name != "nt" or sys.version_info[:2] != (3, 12) or struct.calcsize("P") != 8:
        raise PipelineError("Runtime probe builder requires Windows x64 CPython 3.12")
    python_home, out = plain_path(python_home).resolve(), plain_path(out).resolve()
    if out.exists() or python_home == out or out.is_relative_to(python_home):
        raise PipelineError("Choose a new output directory outside Python home")
    if not (python_home / "python312.dll").is_file() or (python_home / "pyvenv.cfg").exists():
        raise PipelineError("Supply a CPython 3.12 base runtime, not a virtual environment")
    runtime = out / "runtime"
    runtime.mkdir(parents=True)
    for child in python_home.iterdir():
        if child.is_file() and (child.suffix.lower() in (".dll", ".zip") or child.name in ("python.exe", "LICENSE.txt")):
            shutil.copy2(plain_path(child), runtime / child.name)
    for name in ("Lib", "DLLs"):
        copy_tree(python_home / name, runtime / name, excluded=frozenset({"site-packages", "idlelib", "tkinter", "test", "ensurepip"}))
    lock = Path(__file__).with_name("requirements.runtime.lock")
    command = [sys.executable, "-m", "pip", "install", "--require-hashes", "--only-binary=:all:", "--no-compile", "--target", str(runtime / "Lib" / "site-packages"), "-r", str(lock)]
    if wheelhouse:
        command.extend(["--no-index", "--find-links", str(plain_path(wheelhouse))])
    subprocess.run(command, check=True, stdout=sys.stderr, creationflags=subprocess.CREATE_NO_WINDOW)
    package = out / "app" / "tools" / "diagram_pipeline"
    package.parent.mkdir(parents=True)
    copy_tree(Path(__file__).parent, package, excluded=frozenset({"tests", ".pytest_cache"}))
    runner = out / "run_pipeline.py"
    runner.write_text('import runpy, sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).resolve().parent / "app"))\nrunpy.run_module("tools.diagram_pipeline", run_name="__main__")\n', encoding="utf-8")
    # A hostile cwd/PYTHONPATH must not supply the tools package, native libraries or API.
    environment = {**os.environ, "PYTHONPATH": "invalid-untrusted-path", "PYTHONHOME": "invalid-untrusted-home"}
    command = [str(runtime / "python.exe"), "-I", str(runner), "--help"]
    subprocess.run(command, check=True, cwd=out, env=environment, stdout=sys.stderr, creationflags=subprocess.CREATE_NO_WINDOW)
    files = {str(file.relative_to(out)).replace("\\", "/"): hashlib.sha256(file.read_bytes()).hexdigest() for file in out.rglob("*") if file.is_file()}
    report = {"kind": "windows-runtime-probe", "releaseApproved": False, "reason": "PyMuPDF AGPL/commercial and complete runtime redistribution review required", "python": "3.12", "launcher": ["runtime/python.exe", "-I", "run_pipeline.py"], "usesSystemPython": False, "installsAtStartup": False, "requiresGtkOrCairo": False, "files": files}
    (out / "runtime-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return {key: value for key, value in report.items() if key != "files"} | {"files": len(files), "output": str(out)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python-home", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--wheelhouse", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.python_home, args.out_dir, args.wheelhouse)))
    except (PipelineError, OSError, subprocess.CalledProcessError) as exc:
        print(f"Runtime probe failed; output is NOT a release: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
