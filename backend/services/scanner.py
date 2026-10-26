from core.models import DetectionConfig, ScanResult
from core.pipeline import run_pipeline


def scan_image(image: bytes, config: DetectionConfig, content_type: str) -> ScanResult:
    """Adapter seam for a future OCR worker; no storage or network side effects."""
    return run_pipeline(image, config, content_type)
