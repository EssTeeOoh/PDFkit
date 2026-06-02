import time
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.config import (
    LIBREOFFICE,
    POPPLER,
    RATE_LIMIT_REQUESTS,
    RATE_LIMIT_WINDOW_SECONDS,
    TESSERACT,
    get_cors_origins,
)
from app.logger import configure_logging, get_logger
from app.routers import admin_telemetry, compress, convert, merge, sign, split, telemetry
from app.services.rate_limit import InMemoryRateLimiter

configure_logging()
logger = get_logger("app.main")
rate_limiter = InMemoryRateLimiter(
    max_requests=RATE_LIMIT_REQUESTS,
    window_seconds=RATE_LIMIT_WINDOW_SECONDS,
)

app = FastAPI(
    title="PDF Toolkit API",
    description="Merge, split, convert, sign and compress PDF files.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(merge.router, prefix="/api")
app.include_router(split.router, prefix="/api")
app.include_router(convert.router, prefix="/api")
app.include_router(sign.router, prefix="/api")
app.include_router(compress.router, prefix="/api")
app.include_router(telemetry.router, prefix="/api")
app.include_router(admin_telemetry.router, prefix="/api")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = uuid.uuid4().hex[:8]
    started_at = time.perf_counter()

    client_host = request.client.host if request.client else "unknown"
    if (
        request.method != "OPTIONS"
        and request.url.path.startswith("/api")
        and request.url.path != "/api/telemetry/summary"
    ):
        allowed, remaining, reset_after = rate_limiter.check(client_host)
        if not allowed:
            logger.warning("[%s] %s %s rate limited for %s", request_id, request.method, request.url.path, client_host)
            return JSONResponse(
                status_code=429,
                headers={
                    "Retry-After": str(reset_after),
                    "X-RateLimit-Limit": str(RATE_LIMIT_REQUESTS),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(reset_after),
                },
                content={
                    "detail": f"Too many requests. Please wait about {reset_after} seconds and try again."
                },
            )
    else:
        remaining = RATE_LIMIT_REQUESTS
        reset_after = RATE_LIMIT_WINDOW_SECONDS

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        logger.exception("[%s] %s %s crashed in %dms", request_id, request.method, request.url.path, duration_ms)
        raise

    duration_ms = int((time.perf_counter() - started_at) * 1000)
    if response.status_code >= 500:
        logger.error("[%s] %s %s -> %s in %dms", request_id, request.method, request.url.path, response.status_code, duration_ms)
    elif request.url.path.startswith("/api/telemetry"):
        logger.info("[%s] %s %s -> %s in %dms", request_id, request.method, request.url.path, response.status_code, duration_ms)

    response.headers["X-Request-ID"] = request_id
    if request.url.path.startswith("/api"):
        response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_REQUESTS)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_after)
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled application error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "An unexpected server error occurred."})


@app.get("/")
def root():
    return {"message": "PDF Toolkit API is running"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "libreoffice": LIBREOFFICE is not None,
        "tesseract": TESSERACT is not None,
        "poppler": POPPLER is not None,
        "cors_origins": get_cors_origins(),
        "rate_limit": {
            "requests": RATE_LIMIT_REQUESTS,
            "window_seconds": RATE_LIMIT_WINDOW_SECONDS,
        },
    }


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    icon_path = Path(__file__).resolve().parents[2] / "frontend" / "public" / "icon-192.png"
    if icon_path.exists():
        return FileResponse(icon_path)
    return JSONResponse(status_code=404, content={"detail": "Favicon not found"})
