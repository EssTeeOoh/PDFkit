import os
import base64
import io
from pathlib import Path
from typing import Optional

from pypdf import PdfReader, PdfWriter
from pypdf.annotations import FreeText
from pypdf.generic import DictionaryObject
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.utils import ImageReader
from PIL import Image

from app.logger import get_logger

logger = get_logger(__name__)


# ── Helpers ─────────────────────────────────────────────

def _get_page_dimensions(reader: PdfReader) -> list[dict]:
    """Return width/height for every page (in PDF points)."""
    dims = []
    for i, page in enumerate(reader.pages):
        mb = page.mediabox
        dims.append({
            "page":   i + 1,
            "width":  float(mb.width),
            "height": float(mb.height),
        })
    return dims


def _get_fields(reader: PdfReader) -> list[dict]:
    """
    Extract all interactive AcroForm fields with their page, type,
    rect, and — for checkboxes/radios — their valid values.

    Returns [] if the PDF has no form fields.
    """
    raw = reader.get_fields()
    if not raw:
        return []

    # Build a map: field_id -> page + rect by scanning page annotations
    location_map: dict[str, dict] = {}
    radio_map:    dict[str, dict] = {}
    possible_radio_names: set[str] = set()

    for field_id, field in raw.items():
        if field.get("/Kids") and field.get("/FT") == "/Btn":
            possible_radio_names.add(field_id)

    for page_idx, page in enumerate(reader.pages):
        for ann in page.get("/Annots", []):
            # Walk parent chain to get full dotted field id
            components = []
            node = ann
            while node:
                t = node.get("/T")
                if t:
                    components.append(str(t))
                node = node.get("/Parent")
            full_id = ".".join(reversed(components)) if components else None
            if not full_id:
                continue

            rect = ann.get("/Rect")

            if full_id in raw and not raw[full_id].get("/Kids"):
                location_map[full_id] = {
                    "page": page_idx + 1,
                    "rect": [float(v) for v in rect] if rect else None,
                }
            elif full_id in possible_radio_names:
                try:
                    on_values = [v for v in ann["/AP"]["/N"] if v != "/Off"]
                except (KeyError, TypeError):
                    continue
                if len(on_values) == 1:
                    if full_id not in radio_map:
                        radio_map[full_id] = {
                            "field_id": full_id,
                            "type":     "radio_group",
                            "page":     page_idx + 1,
                            "radio_options": [],
                        }
                    radio_map[full_id]["radio_options"].append({
                        "value": str(on_values[0]),
                        "rect":  [float(v) for v in rect] if rect else None,
                    })

    result = []
    for field_id, field in raw.items():
        if field.get("/Kids"):
            continue
        loc = location_map.get(field_id)
        if not loc:
            continue

        ft = field.get("/FT")
        entry: dict = {
            "field_id": field_id,
            "page":     loc["page"],
            "rect":     loc["rect"],
        }

        if ft == "/Tx":
            entry["type"] = "text"
        elif ft == "/Btn":
            entry["type"] = "checkbox"
            states = field.get("/_States_", [])
            if len(states) == 2:
                if "/Off" in states:
                    entry["checked_value"]   = str(states[0] if states[0] != "/Off" else states[1])
                    entry["unchecked_value"] = "/Off"
                else:
                    entry["checked_value"]   = str(states[0])
                    entry["unchecked_value"] = str(states[1])
        elif ft == "/Ch":
            entry["type"] = "choice"
            states = field.get("/_States_", [])
            entry["choice_options"] = [
                {"value": str(s[0]), "text": str(s[1])} for s in states
            ]
        else:
            entry["type"] = "unknown"

        result.append(entry)

    result.extend(radio_map.values())

    # Sort top-to-bottom, left-to-right per page
    def sort_key(f):
        rect = f.get("rect") or (f.get("radio_options") or [{}])[0].get("rect") or [0, 0, 0, 0]
        return (f["page"], -rect[1], rect[0])

    result.sort(key=sort_key)
    logger.info(f"[sign] Found {len(result)} form fields")
    return result


# ── Public: analyze ─────────────────────────────────────

def analyze_pdf(pdf_path: str) -> dict:
    """
    Read a PDF and return everything the frontend needs to build the UI:
    - page_count
    - has_fields (bool)
    - fields (list) — empty for flat PDFs
    - page_dimensions (list of {page, width, height})
    """
    logger.info(f"[sign/analyze] {pdf_path}")
    reader     = PdfReader(pdf_path)
    dims       = _get_page_dimensions(reader)
    fields     = _get_fields(reader)
    has_fields = len(fields) > 0

    logger.info(f"[sign/analyze] {len(reader.pages)} pages, has_fields={has_fields}")
    return {
        "page_count":      len(reader.pages),
        "has_fields":      has_fields,
        "fields":          fields,
        "page_dimensions": dims,
    }


# ── Public: apply ────────────────────────────────────────

def apply_to_pdf(
    pdf_path:    str,
    output_path: str,
    field_values: dict,        # {field_id: value}  — for interactive fields
    annotations:  list[dict],  # list of text/signature placement dicts
) -> None:
    """
    Apply form field values and/or free annotations (text, signature image)
    to a PDF and write the result to output_path.

    annotation dict shape:
    {
        "type":      "text" | "signature",
        "page":      1,           # 1-based
        "x":         120,         # px from left in BROWSER coords (top-left origin)
        "y":         340,         # px from top  in BROWSER coords
        "width":     200,         # only for signature
        "height":    80,          # only for signature
        "content":   "John Doe",  # for text
        "font_size": 12,          # for text
        "image_data":"data:image/png;base64,...",  # for signature
        "preview_width":  595,    # page width as shown in browser (px)
        "preview_height": 842,    # page height as shown in browser (px)
    }
    """
    logger.info(f"[sign/apply] input={pdf_path}")
    logger.info(f"[sign/apply] field_values keys: {list(field_values.keys())}")
    logger.info(f"[sign/apply] annotations count: {len(annotations)}")

    reader = PdfReader(pdf_path)
    writer = PdfWriter(clone_from=reader)

    # ── Step 1: fill interactive form fields ────────────
    if field_values:
        # Group by page
        by_page: dict[int, dict] = {}
        for fid, val in field_values.items():
            # Find which page this field is on
            for page_idx, page in enumerate(reader.pages):
                for ann in page.get("/Annots", []):
                    components = []
                    node = ann
                    while node:
                        t = node.get("/T")
                        if t:
                            components.append(str(t))
                        node = node.get("/Parent")
                    full_id = ".".join(reversed(components)) if components else None
                    if full_id == fid:
                        pg = page_idx + 1
                        if pg not in by_page:
                            by_page[pg] = {}
                        by_page[pg][fid] = val
                        break

        for pg, values in by_page.items():
            writer.update_page_form_field_values(
                writer.pages[pg - 1], values, auto_regenerate=False
            )
        writer.set_need_appearances_writer(True)
        logger.info(f"[sign/apply] Filled {sum(len(v) for v in by_page.values())} field(s)")

    # ── Step 2: apply annotations ───────────────────────
    # Group annotations by page so we build one overlay canvas per page
    ann_by_page: dict[int, list] = {}
    for ann in annotations:
        pg = ann.get("page", 1)
        ann_by_page.setdefault(pg, []).append(ann)

    for pg, page_anns in ann_by_page.items():
        page_idx  = pg - 1
        pdf_page  = reader.pages[page_idx]
        pdf_w     = float(pdf_page.mediabox.width)
        pdf_h     = float(pdf_page.mediabox.height)

        # Build a transparent overlay using reportlab
        overlay_buf = io.BytesIO()
        c = rl_canvas.Canvas(overlay_buf, pagesize=(pdf_w, pdf_h))

        for ann in page_anns:
            ann_type      = ann.get("type")
            prev_w        = float(ann.get("preview_width",  pdf_w))
            prev_h        = float(ann.get("preview_height", pdf_h))
            # Scale factors: browser px → PDF points
            scale_x = pdf_w / prev_w
            scale_y = pdf_h / prev_h

            # Browser coords: origin top-left, Y down
            # PDF coords:     origin bottom-left, Y up
            browser_x  = float(ann.get("x", 0))
            browser_y  = float(ann.get("y", 0))
            box_h      = float(ann.get("height", 0))
            box_w      = float(ann.get("width",  0))

            # browser_y is the TOP of the box (outer border); convert to PDF coords
            # Add 1px inset correction for the item border in browser
            inset = 1.0
            pdf_x      = (browser_x + inset) * scale_x
            pdf_y_top  =  pdf_h - ((browser_y + inset) * scale_y)
            pdf_y_bot  =  pdf_h - ((browser_y + box_h - inset) * scale_y)

            if ann["type"] in ("text", "checkbox"):
                content   = ann.get("content", "")
                font_size = ann.get("font_size", 12) * scale_x

                if content == "\u2713":
                    # Draw checkmark centered in the box
                    # pdf_y_top = top of box, pdf_y_bot = bottom of box
                    box_pdf_h = pdf_y_top - pdf_y_bot        # box height in PDF points
                    box_pdf_w = box_w * scale_x              # box width in PDF points
                    pad       = box_pdf_h * 0.15             # small padding
                    cx        = pdf_x + box_pdf_w * 0.5      # center x
                    cy        = pdf_y_bot + box_pdf_h * 0.5  # center y
                    size      = min(box_pdf_w, box_pdf_h) * 0.7
                    lw        = max(0.8, size * 0.12)
                    c.setLineWidth(lw)
                    c.setStrokeColorRGB(0, 0, 0)
                    # Checkmark: from left-middle down to bottom-center, then up to top-right
                    x1 = cx - size * 0.45;  y1 = cy
                    x2 = cx - size * 0.1;   y2 = cy - size * 0.45
                    x3 = cx + size * 0.45;  y3 = cy + size * 0.45
                    c.line(x1, y1, x2, y2)
                    c.line(x2, y2, x3, y3)
                    logger.debug(f"[sign/apply] checkmark at PDF ({pdf_x:.1f},{pdf_y_bot:.1f}) box=({box_pdf_w:.1f}x{box_pdf_h:.1f}) size={size:.1f}")
                else:
                    c.setFont("Helvetica", font_size)
                    c.drawString(pdf_x, pdf_y_bot, content)

            elif ann_type == "signature":
                img_data = ann.get("image_data", "")
                if not img_data:
                    continue
                # Strip data URI prefix if present
                if "," in img_data:
                    img_data = img_data.split(",", 1)[1]

                img_bytes = base64.b64decode(img_data)
                img_buf   = io.BytesIO(img_bytes)
                pil_img   = Image.open(img_buf).convert("RGBA")

                sig_w = float(ann.get("width",  150)) * scale_x
                sig_h = float(ann.get("height",  60)) * scale_y
                # pdf_y is top of signature box → bottom = pdf_y - sig_h
                sig_bottom = pdf_y_top - sig_h

                # Convert PIL image → reportlab ImageReader
                out_buf = io.BytesIO()
                pil_img.save(out_buf, format="PNG")
                out_buf.seek(0)
                rl_img = ImageReader(out_buf)

                c.drawImage(
                    rl_img,
                    pdf_x, sig_bottom,
                    width=sig_w, height=sig_h,
                    mask="auto",   # respect PNG transparency
                )
                logger.debug(f"[sign/apply] Signature at PDF ({pdf_x:.1f}, {sig_bottom:.1f}) size ({sig_w:.1f}x{sig_h:.1f})")

        c.save()
        overlay_buf.seek(0)

        # Merge overlay onto the page
        overlay_reader = PdfReader(overlay_buf)
        overlay_page   = overlay_reader.pages[0]
        writer.pages[page_idx].merge_page(overlay_page)
        logger.info(f"[sign/apply] Merged overlay onto page {pg} ({len(page_anns)} annotation(s))")

    # ── Write output ────────────────────────────────────
    with open(output_path, "wb") as f:
        writer.write(f)

    size = os.path.getsize(output_path)
    logger.info(f"[sign/apply] Saved: {output_path} ({size} bytes)")