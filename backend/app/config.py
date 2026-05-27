import os
import uuid
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR.parent

load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env.local", override=True)

MAX_FILE_SIZE_MB    = 100
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

LIBREOFFICE_PATHS = [
    "PDFKIT_LIBREOFFICE_PATH",
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    "/usr/bin/libreoffice",
    "/usr/bin/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
]

TESSERACT_PATHS = [
    "PDFKIT_TESSERACT_PATH",
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    "/usr/bin/tesseract",
    "/usr/local/bin/tesseract",
]

POPPLER_PATHS = [
    "PDFKIT_POPPLER_PATH",
    r"C:\Program Files\poppler\Library\bin",
    None,
]

def resolve_tool(env_name: str, paths: list) -> str | None:
    configured = os.getenv(env_name, "").strip()
    if configured:
        return configured if os.path.exists(configured) else None

    for p in paths:
        if p and os.path.exists(p):
            return p
    return None

LIBREOFFICE = resolve_tool("PDFKIT_LIBREOFFICE_PATH", LIBREOFFICE_PATHS)
TESSERACT   = resolve_tool("PDFKIT_TESSERACT_PATH", TESSERACT_PATHS)
POPPLER     = resolve_tool("PDFKIT_POPPLER_PATH", POPPLER_PATHS)

# Raised from 300 to 400 — diagnostic proved 400 DPI + greyscale
# gives better results than 300 DPI with any preprocessing
OCR_DPI = 400

# PDF scan detection thresholds
MIN_PAGE_CHARS = 100
MIN_PAGE_WORDS = 20
MIN_PAGE_LINES = 3

def make_temp_dir() -> Path:
    temp = BASE_DIR / f"temp_{uuid.uuid4().hex}"
    temp.mkdir(parents=True, exist_ok=True)
    return temp

def safe_stem(filename: str | None, fallback: str = "output") -> str:
    if not filename:
        return fallback
    return Path(filename).stem or fallback


def get_cors_origins() -> list[str]:
    raw = os.getenv("PDFKIT_CORS_ORIGINS", "")
    if not raw.strip():
        return DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def get_env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


RATE_LIMIT_REQUESTS = get_env_int("PDFKIT_RATE_LIMIT_REQUESTS", 30)
RATE_LIMIT_WINDOW_SECONDS = get_env_int("PDFKIT_RATE_LIMIT_WINDOW_SECONDS", 60)
