import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

APP_LOG_FILE = LOG_DIR / "pdfkit.log"
ERROR_LOG_FILE = LOG_DIR / "pdfkit-errors.log"


def configure_logging() -> None:
    root = logging.getLogger()
    if getattr(root, "_pdfkit_configured", False):
        return

    root.setLevel(logging.INFO)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.INFO)
    console.setFormatter(formatter)

    app_file = RotatingFileHandler(APP_LOG_FILE, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    app_file.setLevel(logging.INFO)
    app_file.setFormatter(formatter)

    error_file = RotatingFileHandler(ERROR_LOG_FILE, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    error_file.setLevel(logging.ERROR)
    error_file.setFormatter(formatter)

    root.handlers.clear()
    root.addHandler(console)
    root.addHandler(app_file)
    root.addHandler(error_file)
    root._pdfkit_configured = True


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(name)
