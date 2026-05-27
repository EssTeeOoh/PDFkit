import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

from app.config import (
    make_temp_dir, safe_stem,
    MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB,
    LIBREOFFICE,
)
from app.services.convert_service import (
    is_scanned_pdf,
    extract_text_pdf_to_docx,
    ocr_pdf_to_docx,
    convert_word_to_pdf,
)
from app.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)

WORD_MIME_TYPES = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/zip",
    "application/octet-stream",
]


def _check_size(file: UploadFile):
    if file.size and file.size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_FILE_SIZE_MB}MB size limit."
        )


def _secondary_size_check(path: str):
    if os.path.getsize(path) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_FILE_SIZE_MB}MB size limit."
        )


@router.post("/pdf-to-word")
async def pdf_to_word(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    logger.info(f"[/pdf-to-word] '{file.filename}' | type: {file.content_type} | size: {file.size}")

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File must be a PDF.")

    _check_size(file)

    original_name = safe_stem(file.filename, fallback="converted")
    temp_dir      = make_temp_dir()
    input_path    = str(temp_dir / "input.pdf")
    output_path   = str(temp_dir / f"{original_name}.docx")

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        _secondary_size_check(input_path)

        scanned = is_scanned_pdf(input_path)
        logger.info(f"[/pdf-to-word] is_scanned={scanned}")

        if scanned:
            # ── Scanned PDF: best-effort OCR with clear warning ──
            logger.info("[/pdf-to-word] Scanned PDF detected — running OCR (best effort)")
            try:
                ocr_pdf_to_docx(input_path, output_path, original_name)
            except Exception as e:
                logger.error(f"[/pdf-to-word] OCR failed: {e}")
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "This appears to be a scanned (image-based) PDF. "
                        "OCR conversion was attempted but failed. "
                        "For best results, use a text-based PDF."
                    )
                )
        else:
            extract_text_pdf_to_docx(input_path, output_path, original_name)

        if not os.path.exists(output_path):
            raise HTTPException(status_code=500, detail="Conversion produced no output file.")

        download_name = f"{original_name}.docx"
        logger.info(f"[/pdf-to-word] Returning '{download_name}'")
        background_tasks.add_task(shutil.rmtree, str(temp_dir))

        return FileResponse(
            output_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=download_name,
            headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
        )

    except HTTPException:
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise
    except Exception as e:
        logger.exception(f"[/pdf-to-word] Unexpected error: {e}")
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")


@router.post("/word-to-pdf")
async def word_to_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    logger.info(f"[/word-to-pdf] '{file.filename}' | type: {file.content_type} | size: {file.size}")

    filename_lower = (file.filename or "").lower()
    is_word_ext    = filename_lower.endswith(".docx") or filename_lower.endswith(".doc")
    is_word_mime   = file.content_type in WORD_MIME_TYPES

    if not is_word_ext and not is_word_mime:
        raise HTTPException(status_code=400, detail="File must be a .docx or .doc Word file.")

    _check_size(file)

    if not LIBREOFFICE:
        raise HTTPException(
            status_code=503,
            detail="LibreOffice is not installed on this server. Word to PDF is unavailable."
        )

    original_name = safe_stem(file.filename, fallback="converted")
    temp_dir      = make_temp_dir()
    input_path    = str(temp_dir / (file.filename or "input.docx"))

    try:
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        _secondary_size_check(input_path)

        raw_output   = convert_word_to_pdf(input_path, str(temp_dir), LIBREOFFICE)
        final_output = str(temp_dir / f"{original_name}.pdf")
        if raw_output != final_output:
            os.rename(raw_output, final_output)

        download_name = f"{original_name}.pdf"
        logger.info(f"[/word-to-pdf] Returning '{download_name}'")
        background_tasks.add_task(shutil.rmtree, str(temp_dir))

        return FileResponse(
            final_output,
            media_type="application/pdf",
            filename=download_name,
            headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
        )

    except HTTPException:
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise
    except RuntimeError as e:
        logger.error(f"[/word-to-pdf] RuntimeError: {e}")
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception(f"[/word-to-pdf] Unexpected error: {e}")
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")