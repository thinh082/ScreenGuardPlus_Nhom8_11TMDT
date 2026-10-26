from core.models import DetectionConfig, Finding, OCRResult


def detect_sensitive_text(ocr_result: OCRResult, rules: DetectionConfig) -> list[Finding]:
    """TODO: regex + context matching with bounded worker execution.

    Preserve source coordinates. Treat user regex as untrusted; use a timeout-capable
    engine or isolated worker to prevent pathological expressions blocking the app.
    Never substitute demo findings here.
    """
    raise NotImplementedError("Real PII detection is not integrated in Phase 1.")
