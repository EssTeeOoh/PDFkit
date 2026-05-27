"""
routers/compress.py - PDF compression endpoints
POST /api/compress
  Legacy synchronous compression endpoint.
POST /api/compress/jobs
  Creates a background compression job and returns progress via polling.
GET /api/compress/jobs/{job_id}
  Returns job status and progress.
GET /api/compress/jobs/{job_id}/download
  Downloads the finished compressed PDF.
"""
import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from app.config import MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, safe_stem
from app.services.compress_service import compress_pdf
from app.services.job_store import create_job, get_job, set_job_output, update_job

logger = logging.getLogger(__name__)
router = APIRouter(tags=["compress"])


def _check_size(file: UploadFile):
    if file.size and file.size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too large ({file.size / (1024 * 1024):.1f} MB). Maximum allowed size is {MAX_FILE_SIZE_MB} MB."
        )


def _validate_request(file: UploadFile, level: str):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    if level not in ("low", "medium", "high"):
        raise HTTPException(status_code=400, detail="level must be low, medium, or high.")

    _check_size(file)


def _download_name(filename: str | None) -> str:
    return f"{safe_stem(filename, 'compressed')}_compressed.pdf"


def _run_compress_job(job_id: str):
    job = get_job(job_id)
    if not job:
        return

    input_path = Path(job["input_path"])

    try:
        update_job(job_id, status="processing", progress=4, stage="Loading upload")
        input_bytes = input_path.read_bytes()

        def report(progress: int, stage: str):
            update_job(job_id, status="processing", progress=progress, stage=stage)

        output_bytes = compress_pdf(
            input_bytes,
            level=job.get("level") or "medium",
            progress_callback=report,
        )

        download_name = _download_name(job.get("filename"))
        set_job_output(job_id, output_bytes, download_name)
        update_job(job_id, status="done", progress=100, stage="Ready to download")
        logger.info("Compression job %s completed", job_id)
    except Exception as exc:
        logger.exception("Compression job %s failed: %s", job_id, exc)
        update_job(job_id, status="error", error=f"Compression failed: {exc}", stage="Compression failed")


@router.post("/compress")
async def compress_endpoint(
    file: UploadFile = File(...),
    level: str = Form("medium"),
):
    _validate_request(file, level)

    input_bytes = await file.read()
    if not input_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(input_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too large ({len(input_bytes) / (1024 * 1024):.1f} MB). Maximum allowed size is {MAX_FILE_SIZE_MB} MB."
        )

    logger.info("Compressing '%s' at level=%s (%d bytes)", file.filename, level, len(input_bytes))

    try:
        output_bytes = compress_pdf(input_bytes, level=level)
    except Exception as exc:
        logger.exception("Compression failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Compression failed: {exc}")

    out_name = _download_name(file.filename)
    logger.info("Compressed to %d bytes (%.1f%%)", len(output_bytes), 100 * len(output_bytes) / max(len(input_bytes), 1))

    return Response(
        content=output_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{out_name}"'},
    )


@router.post("/compress/jobs")
async def create_compress_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    level: str = Form("medium"),
):
    _validate_request(file, level)

    input_bytes = await file.read()
    if not input_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(input_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File is too large ({len(input_bytes) / (1024 * 1024):.1f} MB). Maximum allowed size is {MAX_FILE_SIZE_MB} MB."
        )

    job = create_job("compress", file.filename, level=level)
    Path(job["input_path"]).write_bytes(input_bytes)
    update_job(
        job["id"],
        status="queued",
        progress=2,
        stage="Upload received",
        input_size=len(input_bytes),
    )
    background_tasks.add_task(_run_compress_job, job["id"])

    logger.info("Queued compression job %s for '%s' at level=%s", job["id"], file.filename, level)
    return {"job_id": job["id"], "status": "queued"}


@router.get("/compress/jobs/{job_id}")
def get_compress_job(job_id: str):
    job = get_job(job_id)
    if not job or job.get("kind") != "compress":
        raise HTTPException(status_code=404, detail="Compression job not found.")

    return {
        "job_id": job["id"],
        "status": job["status"],
        "progress": job["progress"],
        "stage": job["stage"],
        "filename": job["filename"],
        "download_name": job["download_name"],
        "input_size": job["input_size"],
        "result_size": job["result_size"],
        "error": job["error"],
    }


@router.get("/compress/jobs/{job_id}/download")
def download_compress_job(job_id: str):
    job = get_job(job_id)
    if not job or job.get("kind") != "compress":
        raise HTTPException(status_code=404, detail="Compression job not found.")

    if job["status"] != "done":
        raise HTTPException(status_code=409, detail="Compression is not finished yet.")

    output_path = Path(job["output_path"])
    if not output_path.exists():
        raise HTTPException(status_code=410, detail="Compressed file is no longer available.")

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=job["download_name"] or _download_name(job["filename"]),
    )
