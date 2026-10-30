from io import BytesIO

from PIL import Image

from core.detector import detect_sensitive_text
from core.models import DetectionConfig, OCRResult
from core.ocr import _paddle_result, extract_text, OCRUnavailableError


def image_bytes():
    output = BytesIO()
    Image.new("RGB", (500, 100), "white").save(output, format="PNG")
    return output.getvalue()


def test_paddle_line_box_covers_detected_email():
    pages = [{"rec_texts": ["Email: test@example.com"], "rec_scores": [.9],
              "rec_polys": [[[10, 20], [300, 20], [300, 50], [10, 50]]]}]
    result = _paddle_result(image_bytes(), "vie+eng", pages)
    findings = detect_sensitive_text(result, DetectionConfig())
    assert len(findings) == 1 and findings[0].type == "email"
    box = findings[0].box
    assert box.x <= 10 and box.y <= 20
    assert box.x + box.width >= 300 and box.y + box.height >= 50


def test_paddle_failure_falls_back_with_warning(monkeypatch):
    monkeypatch.delenv("SCREENGUARD_OCR_ENGINE", raising=False)
    def unavailable(*args):
        raise OCRUnavailableError("not installed")
    monkeypatch.setattr("core.ocr._extract_paddle", unavailable)
    monkeypatch.setattr("core.ocr._extract_tesseract", lambda *args: OCRResult(
        width=500, height=100, blocks=[], language="eng"))
    assert "Tesseract" in extract_text(image_bytes()).warnings[0]


def test_paddle_is_default(monkeypatch):
    monkeypatch.delenv("SCREENGUARD_OCR_ENGINE", raising=False)
    expected = OCRResult(width=500, height=100, blocks=[], language="eng")
    monkeypatch.setattr("core.ocr._extract_paddle", lambda *args: expected)
    assert extract_text(image_bytes()) is expected
