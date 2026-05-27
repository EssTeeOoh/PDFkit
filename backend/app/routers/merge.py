import os
import shutil
from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse

from app.config import make_temp_dir, safe_stem, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB
from app.services.merge_service import merge_pdfs

router = APIRouter()


def _validate_pdf(file: UploadFile):
    """Raise HTTPException if file is not a valid PDF under the size limit."""
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail=f"'{file.filename}' is not a PDF."
        )
    if file.size and file.size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"'{file.filename}' exceeds the {MAX_FILE_SIZE_MB}MB file size limit."
        )


@router.post("/merge")
async def merge_pdf_files(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
):
    # ── Validation ────────────────────────────────────
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Please upload at least 2 PDF files.")

    for file in files:
        _validate_pdf(file)

    # ── Processing ────────────────────────────────────
    temp_dir = make_temp_dir()

    try:
        input_paths = []
        for file in files:
            if not file.filename:
                raise HTTPException(status_code=400, detail="A file is missing a filename.")
            path = str(temp_dir / file.filename)
            with open(path, "wb") as f:
                shutil.copyfileobj(file.file, f)

            # Secondary size check (in case file.size was not set by client)
            if os.path.getsize(path) > MAX_FILE_SIZE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"'{file.filename}' exceeds the {MAX_FILE_SIZE_MB}MB file size limit."
                )
            input_paths.append(path)

        # Use the first file's name as the base for the output
        output_name = safe_stem(files[0].filename, fallback="merged")
        output_path = str(temp_dir / f"{output_name}_merged.pdf")

        merge_pdfs(input_paths, output_path)

        background_tasks.add_task(shutil.rmtree, str(temp_dir))

        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=f"{output_name}_merged.pdf"
        )

    except HTTPException:
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(str(temp_dir), ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Merge failed: {str(e)}")