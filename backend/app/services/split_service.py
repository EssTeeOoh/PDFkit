import os
import zipfile
from pathlib import Path
from pypdf import PdfWriter, PdfReader


def parse_ranges(range_str: str, total_pages: int) -> list[list[int]]:
    """
    Parse "1-3, 5, 7-10" into groups of 0-indexed page numbers.
    Raises ValueError on invalid input.
    """
    groups = []
    parts = [p.strip() for p in range_str.split(",")]

    for part in parts:
        if not part:
            continue
        if "-" in part:
            halves = part.split("-", 1)
            start, end = int(halves[0].strip()), int(halves[1].strip())
            if start < 1 or end > total_pages or start > end:
                raise ValueError(
                    f"Invalid range: '{part}'. Pages must be between 1 and {total_pages}."
                )
            groups.append(list(range(start - 1, end)))
        else:
            page = int(part.strip())
            if page < 1 or page > total_pages:
                raise ValueError(
                    f"Invalid page number: '{part}'. Pages must be between 1 and {total_pages}."
                )
            groups.append([page - 1])

    if not groups:
        raise ValueError("No valid page ranges found.")

    return groups


def split_by_chunk(total_pages: int, chunk_size: int) -> list[list[int]]:
    """Split pages into equal-sized groups."""
    return [
        list(range(i, min(i + chunk_size, total_pages)))
        for i in range(0, total_pages, chunk_size)
    ]


def split_pdf_to_zip(
    input_path: str,
    mode: str,
    temp_dir: Path,
    original_name: str,
    chunk_size: int | None = None,
    ranges: str | None = None,
) -> str:
    """
    Core split logic. Reads the PDF, splits according to mode,
    writes individual PDFs named after the original file,
    zips them, and returns the zip path.
    """
    reader = PdfReader(input_path)
    total  = len(reader.pages)

    if total == 0:
        raise ValueError("PDF has no pages.")

    # Determine page groups
    if mode == "every":
        groups = [[i] for i in range(total)]
    elif mode == "chunk":
        groups = split_by_chunk(total, chunk_size or 1)
    else:  # ranges
        groups = parse_ranges(ranges or "", total)

    # Write each group as its own PDF
    output_dir = temp_dir / "output"
    output_dir.mkdir(exist_ok=True)

    for idx, group in enumerate(groups):
        writer = PdfWriter()
        for page_idx in group:
            writer.add_page(reader.pages[page_idx])

        # e.g. "my_report_part1_pages_1-3.pdf"
        label    = f"page_{group[0]+1}" if len(group) == 1 else f"pages_{group[0]+1}-{group[-1]+1}"
        out_path = output_dir / f"{original_name}_part{idx+1}_{label}.pdf"

        with open(out_path, "wb") as out:
            writer.write(out)

    # Zip all output PDFs — zip named after original file
    zip_path = str(temp_dir / f"{original_name}_split.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in sorted(os.listdir(output_dir)):
            zf.write(output_dir / fname, fname)

    return zip_path