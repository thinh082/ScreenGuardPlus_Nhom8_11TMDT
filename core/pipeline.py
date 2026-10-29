from core.detector import detect_sensitive_text
from core.models import APIFinding, DetectionConfig, ScanResult
from core.ocr import extract_text
from core.validator import validate_image
from core.rules import validate_rules


def run_pipeline(image: bytes, config: DetectionConfig, content_type: str) -> ScanResult:
    validate_image(image, content_type)
    validate_rules(config)
    ocr_result = extract_text(image, config.language)
    findings = detect_sensitive_text(ocr_result, config)
    types = {"email": "EMAIL", "phone": "PHONE", "cccd": "CITIZEN_ID", "student": "STUDENT_ID", "bank": "BANK_ACCOUNT", "custom": "CUSTOM"}
    public_findings = [APIFinding(id=f.id, type=types[f.type], label=f.label,
                                 bbox=(f.box.x, f.box.y, f.box.x+f.box.width, f.box.y+f.box.height),
                                 risk=f.risk.upper(), score=f.score, ocr_confidence=f.ocr_confidence,
                                 preview=f.preview, source=f.source) for f in findings]
    message = ("Đã nhận diện văn bản. Kết quả tự động có thể bỏ sót thông tin; vui lòng kiểm tra lại ảnh trước khi chia sẻ."
               if findings else "Không phát hiện thông tin nhạy cảm. Vui lòng kiểm tra lại ảnh trước khi chia sẻ.")
    warnings=list(ocr_result.warnings)
    if any(f.ocr_confidence < .20 for f in findings):
        warnings.append('Có vùng đọc chưa rõ, được đề xuất nhờ ngữ cảnh. Hãy kiểm tra kỹ hoặc đánh dấu bổ sung.')
    return ScanResult(width=ocr_result.width, height=ocr_result.height, findings=public_findings,
                      language=ocr_result.language, warnings=warnings, message=message)
