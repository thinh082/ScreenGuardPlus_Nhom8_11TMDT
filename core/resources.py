"""Resource and asset path resolution for both source development and frozen packaging."""
import os
from pathlib import Path
import sys


def get_base_path() -> Path:
    """Return application root directory, handling PyInstaller frozen bundles."""
    if getattr(sys, "frozen", False):
        if hasattr(sys, "_MEIPASS"):
            return Path(sys._MEIPASS).resolve()
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


def get_frontend_dir() -> Path:
    """Locate the frontend assets directory."""
    base = get_base_path()
    candidate = base / "frontend"
    if candidate.is_dir() and (candidate / "index.html").is_file():
        return candidate
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        fallback = exe_dir / "frontend"
        if fallback.is_dir() and (fallback / "index.html").is_file():
            return fallback
    return candidate


def get_icon_path(name: str = "app.ico") -> Path:
    """Return path to an icon inside frontend/icons."""
    frontend = get_frontend_dir()
    return frontend / "icons" / name


def get_bundled_tesseract_dir() -> Path | None:
    """Check if a bundled Tesseract-OCR directory exists alongside the executable or bundle."""
    base = get_base_path()
    for candidate in (
        base / "tesseract",
        base / "Tesseract-OCR",
        Path(sys.executable).resolve().parent / "tesseract" if getattr(sys, "frozen", False) else None,
        Path(sys.executable).resolve().parent / "Tesseract-OCR" if getattr(sys, "frozen", False) else None,
    ):
        if candidate and candidate.is_dir() and (candidate / "tesseract.exe").is_file():
            return candidate
    return None

