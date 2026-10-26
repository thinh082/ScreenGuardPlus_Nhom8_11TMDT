from fastapi import APIRouter, HTTPException, Request

from backend.services.scanner import scan_image
from core.models import DetectionConfig, ScanResult
from core.ocr import OCRUnavailableError
from core.validator import MAX_BYTES, ImageValidationError

router = APIRouter()


@router.get("/health")
def health():
    return {"status": "ok", "phase": 1, "ocr": "not_implemented", "pii": "not_implemented", "stores_images": False}


@router.get("/config", response_model=DetectionConfig)
def default_config():
    """Defaults only. Per-device configuration is owned by the browser."""
    return DetectionConfig()


@router.post(
    "/scan", response_model=ScanResult,
    responses={413: {"description": "Image exceeds 10 MB"}, 415: {"description": "Unsupported MIME type"},
               422: {"description": "Invalid image"}, 501: {"description": "Real OCR is not integrated"}},
    openapi_extra={"requestBody": {"required": True, "content": {
        mime: {"schema": {"type": "string", "format": "binary"}}
        for mime in ("image/png", "image/jpeg", "image/webp")
    }}},
)
async def scan(request: Request):
    """Future raw-image endpoint. Phase 1 validates input, then explicitly returns 501.

    Body: raw PNG/JPEG/WebP bytes; Content-Type must be the corresponding image MIME.
    Browser UI never calls this endpoint in Phase 1. No files or text are persisted.
    """
    content_type = request.headers.get("content-type", "").split(";")[0].lower()
    if content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(415, detail="Only PNG, JPEG and WebP images are supported.")
    payload = bytearray()
    async for chunk in request.stream():
        if len(payload) + len(chunk) > MAX_BYTES:
            raise HTTPException(413, detail="Image exceeds the 10 MB limit.")
        payload.extend(chunk)
    try:
        return scan_image(bytes(payload), DetectionConfig(), content_type)
    except ImageValidationError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    except OCRUnavailableError as exc:
        raise HTTPException(501, detail={"code": "OCR_NOT_IMPLEMENTED", "message": str(exc)}) from exc
    finally:
        payload.clear()
