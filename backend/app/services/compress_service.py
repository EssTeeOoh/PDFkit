"""
compress_service.py — PDF compression using pypdf 5.x ImageFile.replace() API
Levels:
  low    → scale 0.9,  JPEG quality 88  (light, print-safe)
  medium → scale 0.65, JPEG quality 72  (balanced)
  high   → scale 0.45, JPEG quality 55  (maximum, still readable)
"""
import io
import logging
from collections.abc import Callable

from PIL import Image
from pypdf import PdfReader, PdfWriter

logger = logging.getLogger(__name__)

LEVEL_SETTINGS = {
    "low":    {"scale": 0.90, "quality": 88, "resample": Image.Resampling.BOX},
    "medium": {"scale": 0.65, "quality": 72, "resample": Image.Resampling.BILINEAR},
    "high":   {"scale": 0.45, "quality": 55, "resample": Image.Resampling.LANCZOS},
}

# Minimum image area to bother resampling (skip tiny icons/logos)
MIN_PIXELS = 64 * 64


def compress_pdf(
    input_bytes: bytes,
    level: str = "medium",
    progress_callback: Callable[[int, str], None] | None = None,
) -> bytes:
    """
    Compress a PDF and return the compressed bytes.

    Strategy:
      1. Re-encode embedded images at lower resolution using pypdf's
         ImageFile.replace() API (works correctly with pypdf 5.x).
      2. Deduplicate identical objects with compress_identical_objects().

    Falls back gracefully on any per-image error so the PDF is always returned.
    """
    settings  = LEVEL_SETTINGS.get(level, LEVEL_SETTINGS["medium"])
    scale     = settings["scale"]
    quality   = settings["quality"]
    resample  = settings["resample"]

    def report(progress: int, stage: str):
        if progress_callback:
            progress_callback(progress, stage)

    report(5, "Reading PDF")
    reader = PdfReader(io.BytesIO(input_bytes))
    writer = PdfWriter()

    for page in reader.pages:
        writer.add_page(page)

    if reader.metadata:
        writer.add_metadata(reader.metadata)

    total_pages = max(len(writer.pages), 1)
    report(15, "Preparing pages")

    total_replaced = 0
    total_skipped  = 0

    for page_num, page in enumerate(writer.pages):
        try:
            imgs = page.images
        except Exception as exc:
            logger.warning("Page %d: could not read images — %s", page_num + 1, exc)
            continue

        for img_file in imgs:
            try:
                pil: Image.Image = img_file.image  # type: ignore[union-attr]

                if pil.width * pil.height < MIN_PIXELS:
                    total_skipped += 1
                    continue

                # Resize
                new_w = max(1, int(pil.width  * scale))
                new_h = max(1, int(pil.height * scale))

                if pil.mode not in ("RGB", "L", "RGBA"):
                    pil = pil.convert("RGB")

                resized = pil.resize((new_w, new_h), resample)

                # Convert RGBA → RGB for JPEG
                if resized.mode == "RGBA":
                    bg = Image.new("RGB", resized.size, (255, 255, 255))
                    bg.paste(resized, mask=resized.split()[3])
                    resized = bg
                elif resized.mode != "RGB" and resized.mode != "L":
                    resized = resized.convert("RGB")

                # Replace in-place using pypdf's API
                img_file.replace(resized, quality=quality)
                total_replaced += 1

                logger.debug(
                    "Page %d %s: %dx%d -> %dx%d",
                    page_num + 1, img_file.name,
                    pil.width, pil.height, new_w, new_h
                )

            except Exception as exc:
                logger.warning(
                    "Page %d %s: image replacement failed — %s",
                    page_num + 1,
                    getattr(img_file, "name", "?"),
                    exc
                )
                total_skipped += 1
                continue

        page_progress = 15 + int(((page_num + 1) / total_pages) * 65)
        report(page_progress, f"Compressing page {page_num + 1} of {total_pages}")

    logger.info(
        "Compression complete: %d images replaced, %d skipped",
        total_replaced, total_skipped
    )

    # Deduplicate identical stream objects
    report(88, "Finalizing document")
    try:
        writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)
    except Exception as exc:
        logger.warning("compress_identical_objects failed: %s", exc)

    out = io.BytesIO()
    report(96, "Writing compressed PDF")
    writer.write(out)
    report(100, "Compression complete")
    return out.getvalue()
