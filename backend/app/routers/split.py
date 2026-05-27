import os
import shutil
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

from app.config import make_temp_dir, safe_stem, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB
from app.services.split_service import split_pdf_to_zip

router = APIRouter()


@router.post("/split")
async def split_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    mode: str = Form(...),
    chunk_size: Optional[int] = Form(None),
    ranges: Optional[str] = Form(None),
):
    # ── Validation ────────────────────────────────────
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="File must be a PDF.")

    if file.size and file.size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_FILE_SIZE_MB}MB size limit."
        )

    if mode not in ("every", "chunk", "ranges"):
        raise HTTPException(status_code=400, detail="Invalid split mode.")

    if mode == "chunk" and (not chunk_size or chunk_size < 1):
        raise HTTPException(status_code=400, detail="chunk_size must be a positive number.")

    if mode == "ranges" and not ranges:
        raise HTTPException(status_code=400, detail="Please provide page ranges.")

    # ── Processing ────────────────────────────────────
    temp_dir    = make_temp_dir()
    original_name = safe_stem(file.filename, fallback="document")

    try:
        input_path = str(temp_dir / (file.filename or "input.pdf"))
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Secondary size check
        if os.path.getsize(input_path) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds the {MAX_FILE_SIZE_MB}MB size limit."
            )

        zip_path = split_pdf_to_zip(
            input_path=input_path,
            mode=mode,
            temp_dir=temp_dir,
            original_name=original_name,
            chunk_size=chunk_size,
            ranges=ranges,
        )

        background_tasks.add_task(shutil.rmtree, str(temp_dir))

        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename=f"{original_name}_split.zip"
        )

    except HTTPException:
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise
    except ValueError as e:
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Split failed: {str(e)}")