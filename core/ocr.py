"""Local Tesseract OCR. No image/text logging and no network calls."""
from collections import OrderedDict
from io import BytesIO
import os
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageOps
import pytesseract

from core.models import BoundingBox, OCRBlock, OCRLine, OCRResult, TokenSpan
from core.validator import ImageValidationError, validate_image

OCR_TIMEOUT = 25
MAX_TOKENS = 20_000
MAX_TEXT = 100_000


def tessdata_directory() -> str | None:
    configured = os.environ.get("TESSDATA_PREFIX")
    if configured:
        return configured
    try:
        from core.resources import get_bundled_tesseract_dir
        bundled = get_bundled_tesseract_dir()
        if bundled:
            tessdata = bundled / "tessdata"
            if (tessdata / "eng.traineddata").is_file():
                return str(tessdata)
    except Exception:
        pass
    base = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share"))
    local = base / "ScreenGuardPlus" / "tessdata"
    return str(local) if (local / "eng.traineddata").is_file() else None


class OCRUnavailableError(RuntimeError):
    pass


class OCRProcessingError(RuntimeError):
    pass


def find_tesseract() -> str | None:
    configured = os.environ.get("TESSERACT_CMD")
    if configured:
        return configured if Path(configured).is_file() else shutil.which(configured)
    try:
        from core.resources import get_bundled_tesseract_dir
        bundled = get_bundled_tesseract_dir()
        if bundled and (bundled / "tesseract.exe").is_file():
            return str(bundled / "tesseract.exe")
    except Exception:
        pass
    binary = shutil.which("tesseract")
    if binary:
        return binary
    for base in (os.environ.get("LOCALAPPDATA", ""), os.environ.get("ProgramFiles", ""), os.environ.get("ProgramFiles(x86)", "")):
        if not base:
            continue
        for suffix in ("Programs/Tesseract-OCR/tesseract.exe", "Tesseract-OCR/tesseract.exe"):
            candidate = Path(base) / suffix
            if candidate.is_file():
                return str(candidate)
    return None


def get_ocr_status() -> dict:
    binary = find_tesseract()
    status = {"tesseract_installed": False, "languages": [], "ocr_available": False}
    if not binary:
        return status
    try:
        directory = tessdata_directory()
        command = [binary, "--list-langs"] + (["--tessdata-dir", directory] if directory else [])
        result = subprocess.run(command, capture_output=True, timeout=5,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        if result.returncode != 0:
            return status
        output = result.stdout.decode("utf-8", errors="replace").splitlines()
        languages = sorted(line.strip() for line in output if line.strip().isascii()
                           and line.strip().isalpha() and len(line.strip()) == 3)
        return {"tesseract_installed": True, "languages": languages,
                "ocr_available": bool({"eng", "vie"}.intersection(languages))}
    except (OSError, subprocess.SubprocessError):
        return status


def choose_language(requested: str, available: list[str]) -> tuple[str, list[str]]:
    desired = requested.split("+")
    chosen = [lang for lang in desired if lang in available]
    warnings = []
    missing = [lang for lang in desired if lang not in available]
    if missing:
        if "eng" in available and "eng" not in chosen:
            chosen.append("eng")
        warnings.append("Thiếu gói ngôn ngữ " + ", ".join(missing) + "; đang dùng " + "+".join(chosen or ["không có"]) + ".")
    if not chosen:
        raise OCRUnavailableError("Tesseract chưa có gói ngôn ngữ yêu cầu hoặc eng để dự phòng. Hãy cài eng/vie.")
    return "+".join(chosen), warnings


def build_lines(blocks: list[OCRBlock]) -> list[OCRLine]:
    grouped = OrderedDict()
    for index, block in enumerate(blocks):
        grouped.setdefault(block.line_id, []).append((index, block))
    lines = []
    for entries in grouped.values():
        entries.sort(key=lambda item: item[1].box.x)
        text, spans = "", []
        for index, block in entries:
            if text:
                text += " "
            start = len(text)
            text += block.text
            spans.append(TokenSpan(start=start, end=len(text), token_index=index))
        lines.append(OCRLine(text=text, spans=spans))
    return lines


def extract_text(image: bytes, language: str = "vie+eng") -> OCRResult:
    validate_image(image)
    status = get_ocr_status()
    if not status["ocr_available"]:
        raise OCRUnavailableError("Tesseract chưa sẵn sàng. Hãy cài Tesseract và gói eng/vie; bạn vẫn có thể đánh dấu thủ công.")
    selected_language, warnings = choose_language(language, status["languages"])
    try:
        with Image.open(BytesIO(image)) as source:
            oriented = ImageOps.exif_transpose(source)
            rgba = oriented.convert("RGBA")
            rgb = Image.new("RGB", rgba.size, "white")
            rgb.paste(rgba, mask=rgba.getchannel("A"))
            width, height = rgb.size
            
            # Adaptive upscaling for screen captures with small font/resolution
            scale = 1.0
            if width < 1600 or height < 1200:
                scale = 2.0
                ocr_img = rgb.resize((int(width * scale), int(height * scale)), Image.Resampling.LANCZOS)
            else:
                ocr_img = rgb

            pytesseract.pytesseract.tesseract_cmd = find_tesseract()
            directory = tessdata_directory()
            # pytesseract's Windows shlex preserves quotes in config paths. The engine
            # environment supports spaced paths reliably and is constant for this server.
            if directory:
                os.environ.setdefault("TESSDATA_PREFIX", directory)
            data = pytesseract.image_to_data(ocr_img, lang=selected_language, config="--oem 3 --psm 6",
                                             output_type=pytesseract.Output.DICT, timeout=OCR_TIMEOUT)
        blocks, chars = [], 0
        for index, raw in enumerate(data["text"]):
            text = raw.strip()
            confidence = float(data["conf"][index])
            if not text or confidence < 0:
                continue
            raw_x, raw_y = data["left"][index], data["top"][index]
            raw_w, raw_h = data["width"][index], data["height"][index]
            if scale != 1.0:
                x = max(0, int(round(raw_x / scale)))
                y = max(0, int(round(raw_y / scale)))
                right = min(width, int(round((raw_x + raw_w) / scale)))
                bottom = min(height, int(round((raw_y + raw_h) / scale)))
            else:
                x, y = max(0, int(raw_x)), max(0, int(raw_y))
                right = min(width, x + int(raw_w))
                bottom = min(height, y + int(raw_h))
            if right <= x or bottom <= y:
                continue
            chars += len(text)
            if len(blocks) >= MAX_TOKENS or chars > MAX_TEXT:
                raise OCRProcessingError("Ảnh có quá nhiều văn bản. Hãy cắt thành vùng nhỏ hơn rồi kiểm tra lại.")
            blocks.append(OCRBlock(text=text, confidence=max(0, min(1, confidence / 100)),
                                   box=BoundingBox(x=x, y=y, width=right-x, height=bottom-y),
                                   line_id=tuple(int(data[key][index]) for key in ("page_num", "block_num", "par_num", "line_num"))))
        lines = build_lines(blocks)
        return OCRResult(width=width, height=height, blocks=blocks, lines=lines,
                         text="\n".join(line.text for line in lines), language=selected_language, warnings=warnings)
    except pytesseract.TesseractNotFoundError as exc:
        raise OCRUnavailableError("Không tìm thấy Tesseract. Kiểm tra TESSERACT_CMD.") from exc
    except (pytesseract.TesseractError, RuntimeError) as exc:
        if isinstance(exc, OCRProcessingError):
            raise
        raise OCRProcessingError("OCR thất bại hoặc quá thời gian 25 giây. Hãy thử ảnh rõ hơn hoặc đánh dấu thủ công.") from exc
    except (OSError, ValueError) as exc:
        raise ImageValidationError("Không đọc được đầy đủ dữ liệu ảnh.") from exc
