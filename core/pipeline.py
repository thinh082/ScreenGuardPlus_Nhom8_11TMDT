from core.detector import detect_sensitive_text
from core.models import DetectionConfig, ScanResult
from core.ocr import extract_text
from core.validator import validate_image


def run_pipeline(image: bytes, config: DetectionConfig, content_type: str) -> ScanResult:
    validate_image(image, content_type)
    ocr_result = extract_text(image, config.language)
    findings = detect_sensitive_text(ocr_result, config)
    return ScanResult(status="complete", source="ocr", width=ocr_result.width, height=ocr_result.height,
                      findings=findings, message="Automatic detection may miss personal information. Review the entire image.")
