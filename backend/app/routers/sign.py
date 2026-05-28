import json
import logging
import os
import shutil

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.config import make_temp_dir, safe_stem, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB
from app.services.sign_service import analyze_pdf, apply_to_pdf

logger = logging.getLogger(__name__)
router = APIRouter()


def _check_size(file: UploadFile):
    if file.size and file.size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too large ({file.size / (1024*1024):.1f} MB). Maximum allowed size is {MAX_FILE_SIZE_MB} MB."
        )


@router.post("/sign/analyze")
async def sign_analyze(file: UploadFile = File(...)):
    """
    Receive a PDF and return its structure:
    - page_count
    - has_fields
    - fields (list of interactive form fields with type, page, rect)
    - page_dimensions (width/height per page in PDF points)
    """
    logger.info(f"[/sign/analyze] '{file.filename}' size={file.size}")

    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()
    if content_type != "application/pdf" and not filename.endswith(".pdf"):
        detail = f"File must be a PDF. Received content type '{file.content_type or 'unknown'}'."
        logger.warning(f"[/sign/analyze] rejecting upload: {detail}")
        raise HTTPException(
            status_code=400,
            detail=detail,
        )
    _check_size(file)

    temp_dir   = make_temp_dir()
    input_path = str(temp_dir / "input.pdf")

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Secondary size check
        if os.path.getsize(input_path) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds the {MAX_FILE_SIZE_MB} MB size limit."
            )

        result = analyze_pdf(input_path)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"[/sign/analyze] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Could not analyze PDF: {str(e)}")
    finally:
        shutil.rmtree(str(temp_dir), ignore_errors=True)


@router.post("/sign/apply")
async def sign_apply(
    background_tasks: BackgroundTasks,
    file:         UploadFile = File(...),
    field_values: str        = Form(default="{}"),
    annotations:  str        = Form(default="[]"),
):
    """
    Apply form fills and/or annotations to a PDF.

    Form fields:
    - file:         the original PDF
    - field_values: JSON string  {field_id: value, ...}
    - annotations:  JSON string  [{type, page, x, y, ...}, ...]

    Returns the filled/signed PDF as a download.
    """
    logger.info(f"[/sign/apply] '{file.filename}' size={file.size}")
    logger.info(
        "[/sign/apply] raw payload lengths field_values=%d annotations=%d",
        len(field_values or ""),
        len(annotations or ""),
    )
    logger.info(
        "[/sign/apply] raw payload preview field_values=%r annotations=%r",
        (field_values or "")[:500],
        (annotations or "")[:500],
    )

    content_type = (file.content_type or "").lower()
    filename = (file.filename or "").lower()
    if content_type != "application/pdf" and not filename.endswith(".pdf"):
        detail = f"File must be a PDF. Received content type '{file.content_type or 'unknown'}'."
        logger.warning(f"[/sign/apply] rejecting upload: {detail}")
        raise HTTPException(
            status_code=400,
            detail=detail,
        )
    _check_size(file)

    # Parse JSON payloads
    try:
        fv = json.loads(field_values)
    except json.JSONDecodeError:
        detail = "field_values must be valid JSON."
        logger.warning(f"[/sign/apply] rejecting payload: {detail}")
        raise HTTPException(status_code=400, detail=detail)
    try:
        anns = json.loads(annotations)
    except json.JSONDecodeError:
        detail = "annotations must be valid JSON."
        logger.warning(f"[/sign/apply] rejecting payload: {detail}")
        raise HTTPException(status_code=400, detail=detail)

    if not fv and not anns:
        raise HTTPException(
            status_code=400,
            detail="Nothing to apply — send field_values and/or annotations."
        )

    original_name = safe_stem(file.filename, fallback="signed")
    temp_dir      = make_temp_dir()
    input_path    = str(temp_dir / "input.pdf")
    output_path   = str(temp_dir / f"{original_name}_signed.pdf")

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Secondary size check
        if os.path.getsize(input_path) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds the {MAX_FILE_SIZE_MB} MB size limit."
            )

        apply_to_pdf(
            pdf_path=input_path,
            output_path=output_path,
            field_values=fv,
            annotations=anns,
        )

        if not os.path.exists(output_path):
            raise HTTPException(status_code=500, detail="Signing produced no output file.")

        download_name = f"{original_name}_signed.pdf"
        logger.info(f"[/sign/apply] Returning '{download_name}'")
        background_tasks.add_task(shutil.rmtree, str(temp_dir))

        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=download_name,
            headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
        )

    except HTTPException:
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise
    except Exception as e:
        logger.exception(f"[/sign/apply] Error: {e}")
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Signing failed: {str(e)}")
