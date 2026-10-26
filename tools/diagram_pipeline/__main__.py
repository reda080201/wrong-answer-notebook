import argparse
import json
import sys
from pathlib import Path

from .security import PipelineError


def main():
    parser = argparse.ArgumentParser(description="Offline PNG generation; machine checks never approve mathematical equivalence.")
    subs = parser.add_subparsers(dest="command", required=True)
    inspect = subs.add_parser("inspect", help="Copy immutable evidence and inspect PDF page objects; never infer equations")
    inspect.add_argument("--input", type=Path, required=True)
    inspect.add_argument("--out-dir", type=Path, required=True)
    for name in ("render", "verify", "package"):
        cmd = subs.add_parser(name)
        cmd.add_argument("--manifest", type=Path, required=True)
        if name == "render":
            cmd.add_argument("--out-dir", type=Path, required=True)
        if name == "package":
            cmd.add_argument("--output", type=Path, required=True)
    vision = subs.add_parser("import-vision", help="Bind validated observations to inspected evidence")
    vision.add_argument("--inspection", type=Path, required=True)
    vision.add_argument("--analysis", type=Path, required=True)
    vision.add_argument("--source-map", type=Path, required=True)
    vision.add_argument("--out-dir", type=Path, required=True)
    vision.add_argument("--exclude", action="append", default=[])
    run = subs.add_parser("run-vision", help="Create PNG/Import ZIP from an exported analysis job")
    run.add_argument("--job", type=Path, required=True)
    run.add_argument("--out-dir", type=Path, required=True)
    run.add_argument("--exclude", action="append", default=[])
    args = parser.parse_args()
    try:
        from .pipeline import inspect_input, package, render, verify, versions
        versions()
        if args.command == "run-vision":
            from .vision_adapter import run_vision
            result = run_vision(args.job, args.out_dir, args.exclude)
        elif args.command == "import-vision":
            from .vision_adapter import import_vision
            result = import_vision(args.inspection, args.analysis, args.source_map, args.out_dir, args.exclude)
        elif args.command == "inspect":
            result = inspect_input(args.input, args.out_dir)
        elif args.command == "render":
            result = render(args.manifest, args.out_dir)
        elif args.command == "verify":
            result = verify(args.manifest)
        else:
            result = package(args.manifest, args.output)
        print(json.dumps(result, ensure_ascii=True, allow_nan=False))
        return 0
    except ModuleNotFoundError as exc:
        print(f"Missing dependency: {exc.name}. Install tools/diagram_pipeline/requirements.lock.", file=sys.stderr)
        return 3
    except KeyboardInterrupt:
        print("Cancelled; original evidence retained. Use a new output directory to retry.", file=sys.stderr)
        return 130
    except (PipelineError, OSError, ValueError) as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
