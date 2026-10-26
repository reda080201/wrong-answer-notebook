from __future__ import annotations

import io
import math
import warnings
from contextlib import closing
from pathlib import Path

from PIL import Image, ImageOps

from .security import MAX_IMAGE, PipelineError, crop_box, dimensions, read_bytes

Image.MAX_IMAGE_PIXELS = 64_000_000


def decode(data: bytes, suffix: str):
    if len(data) > MAX_IMAGE:
        raise PipelineError("Image exceeds 25MiB")
    formats = {".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG", ".webp": "WEBP"}
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            with Image.open(io.BytesIO(data)) as image:
                if image.format != formats.get(suffix.lower()):
                    raise PipelineError("Image content/extension mismatch")
                dimensions(*image.size)
                if getattr(image, "n_frames", 1) != 1:
                    raise PipelineError("Animated images are unsupported")
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                displayed = ImageOps.exif_transpose(image).convert("RGB")
                dimensions(*displayed.size)
                return displayed
        except (OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            raise PipelineError("Image cannot be fully decoded") from exc


def png(image):
    dimensions(*image.size)
    stream = io.BytesIO()
    image.save(stream, format="PNG", optimize=False)
    data = stream.getvalue()
    if len(data) > MAX_IMAGE:
        raise PipelineError("PNG exceeds 25MiB")
    return data


def crop_image(image, crop):
    x, y, width, height = crop_box(crop)
    w, h = image.size
    bounds = (math.floor(x * w), math.floor(y * h), min(w, math.ceil((x + width) * w)), min(h, math.ceil((y + height) * h)))
    result = image.crop(bounds)
    dimensions(*result.size)
    return result


def pdf_page(path: Path, page_number: int, dpi=200, crop=None):
    import pypdfium2 as pdfium
    with pdfium.PdfDocument(read_bytes(path)) as document:
        if isinstance(page_number, bool) or not isinstance(page_number, int) or not 1 <= page_number <= len(document):
            raise PipelineError("PDF page is out of range")
        with closing(document[page_number - 1]) as page:
            width, height = page.get_size()
            scale = dpi / 72
            box = (0, 0, 0, 0)
            if crop:
                x, y, w, h = crop_box(crop)
                box = (x * width, (1 - y - h) * height, (1 - x - w) * width, y * height)
                width, height = width * w, height * h
            dimensions(math.ceil(width * scale), math.ceil(height * scale))
            with closing(page.render(scale=scale, crop=box, may_draw_forms=False, draw_annots=False, limit_image_cache=True)) as bitmap:
                result = bitmap.to_pil().convert("RGB")
            return result


def pdf_info(path: Path):
    import pypdfium2 as pdfium
    with pdfium.PdfDocument(read_bytes(path)) as document:
        if not 0 < len(document) <= 300:
            raise PipelineError("PDF must contain 1..300 pages")
        pages = []
        for index in range(len(document)):
            with closing(document[index]) as page:
                counts = {}
                for count, obj in enumerate(page.get_objects(max_depth=8)):
                    if count >= 50_000:
                        raise PipelineError("PDF object inspection limit exceeded")
                    counts[str(obj.type)] = counts.get(str(obj.type), 0) + 1
                pages.append({"number": index + 1, "width": page.get_width(), "height": page.get_height(), "rotation": page.get_rotation(), "objectCounts": counts})
        return pages
