from core.models import OCRResult


class OCRUnavailableError(NotImplementedError):
    pass


def extract_text(image: bytes, language: str = "vie+eng") -> OCRResult:
    """TODO: integrate Tesseract locally; return blocks in original-image pixels.

    Do not log image bytes, OCR text, or send them to a cloud provider.
    """
    raise OCRUnavailableError("Real OCR is not integrated in Phase 1. Use the built-in browser demo or mark regions manually.")
