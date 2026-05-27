import threading
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any

from app.config import make_temp_dir

_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def create_job(kind: str, filename: str, level: str | None = None) -> dict[str, Any]:
    job_id = uuid.uuid4().hex
    temp_dir = make_temp_dir()
    input_path = temp_dir / "input.bin"
    output_path = temp_dir / "output.bin"

    job = {
        "id": job_id,
        "kind": kind,
        "status": "queued",
        "progress": 0,
        "stage": "Waiting to start",
        "filename": filename,
        "level": level,
        "error": None,
        "download_name": None,
        "input_size": None,
        "result_size": None,
        "temp_dir": str(temp_dir),
        "input_path": str(input_path),
        "output_path": str(output_path),
    }

    with _lock:
        _jobs[job_id] = job

    return deepcopy(job)


def get_job(job_id: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        return deepcopy(job) if job else None


def update_job(job_id: str, **fields: Any) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        job.update(fields)
        return deepcopy(job)


def set_job_output(job_id: str, output_bytes: bytes, download_name: str) -> dict[str, Any] | None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return None

        output_path = Path(job["output_path"])
        output_path.write_bytes(output_bytes)
        job["download_name"] = download_name
        job["result_size"] = len(output_bytes)
        return deepcopy(job)
