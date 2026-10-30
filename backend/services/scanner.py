from core.models import DetectionConfig, ScanResult
from core.pipeline import run_pipeline


def scan_image(image: bytes, config: DetectionConfig, content_type: str) -> ScanResult:
    """Synchronous local OCR adapter; caller runs it in a bounded worker thread."""
    return run_pipeline(image, config, content_type)
