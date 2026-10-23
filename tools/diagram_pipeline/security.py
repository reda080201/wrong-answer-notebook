"""Bounded input and exclusive output helpers shared by every CLI command."""
from __future__ import annotations

import hashlib
import json
import math
import os
import stat
from pathlib import Path, PurePosixPath

MAX_INPUT = 500 * 1024**2
MAX_JSON = 20 * 1024**2
MAX_IMAGE = 25 * 1024**2
MAX_PIXELS = 64_000_000
MAX_EDGE = 16_384
MAX_DECODED = 256 * 1024**2


class PipelineError(ValueError):
    """A user-visible validation failure, never permission to discard evidence."""


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def plain_path(path: Path) -> Path:
    path = path.absolute()
    for part in (path, *path.parents):
        if part.is_symlink() or part.is_junction():
            raise PipelineError(f"Symlink/reparse path is not allowed: {part}")
        if part.exists() and getattr(part.stat(), "st_file_attributes", 0) & 0x400:
            raise PipelineError(f"Reparse path is not allowed: {part}")
    return path


def relative_path(root: Path, name: str) -> Path:
    if not isinstance(name, str) or not name or "\\" in name or ":" in name:
        raise PipelineError(f"Unsafe asset path: {name!r}")
    parts = name.split("/")
    if PurePosixPath(name).is_absolute() or any(p in ("", ".", "..") for p in parts):
        raise PipelineError(f"Unsafe asset path: {name!r}")
    base = plain_path(root).resolve()
    result = plain_path(base.joinpath(*parts))
    if not result.resolve().is_relative_to(base):
        raise PipelineError("Asset escaped the manifest directory")
    return result


def read_bytes(path: Path, limit: int = MAX_INPUT) -> bytes:
    path = plain_path(path)
    with path.open("rb") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise PipelineError(f"Not a regular file: {path}")
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise PipelineError(f"File exceeds {limit} bytes: {path.name}")
    return data


def _unique_pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise PipelineError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json(path: Path):
    try:
        return json.loads(read_bytes(path, MAX_JSON), object_pairs_hook=_unique_pairs, parse_constant=lambda s: (_ for _ in ()).throw(PipelineError(f"Nonfinite JSON: {s}")))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise PipelineError(f"Invalid JSON: {path.name}") from exc


def write_new(path: Path, data: bytes):
    path = plain_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("xb") as stream:
            stream.write(data)
    except FileExistsError:
        if read_bytes(path) != data:
            raise PipelineError(f"Refusing to overwrite: {path}") from None


def json_bytes(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def number(value, name="number", bound=1e9):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or abs(value) > bound:
        raise PipelineError(f"Invalid {name}")
    return float(value)


def dimensions(width, height):
    if not isinstance(width, int) or not isinstance(height, int) or min(width, height) <= 0 or max(width, height) > MAX_EDGE or width * height > MAX_PIXELS or width * height * 4 > MAX_DECODED:
        raise PipelineError(f"Image dimensions exceed policy: {width}x{height}")


def crop_box(crop):
    if not isinstance(crop, dict) or set(crop) != {"x", "y", "width", "height"}:
        raise PipelineError("Crop must contain x/y/width/height")
    x, y, w, h = (number(crop[k], "crop") for k in ("x", "y", "width", "height"))
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > 1 + 1e-12 or y + h > 1 + 1e-12:
        raise PipelineError("Crop must fit the displayed page, in normalized coordinates")
    return x, y, w, h
