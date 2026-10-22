"""Absolute isolated entrypoint, usable from a packaged runtime or any cwd."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.diagram_pipeline._worker import main  # noqa: E402

if __name__ == "__main__":
    main()
