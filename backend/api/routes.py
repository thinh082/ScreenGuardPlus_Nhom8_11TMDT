import asyncio

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from backend.services.scanner import scan_image
from core.models import DetectionConfig, ScanResult
from core.ocr import OCRUnavailableError, OCRProcessingError, get_ocr_status
from core.validator import ImageValidationError
from core.rules import RuleValidationError, validate_rules
from backend.api.uploads import read_scan_form

router = APIRouter()
scan_slots = asyncio.Semaphore(2)


@router.get("/health")
def health():
    return {"status": "ok", "backend_available": True, "phase": 2,
            **get_ocr_status(), "detector_available": True, "stores_images": False,
            "processing": "python_backend"}


@router.get("/config", response_model=DetectionConfig)
def default_config():
    """Defaults only. Per-device configuration is owned by the browser."""
    return DetectionConfig()


@router.post("/config/validate")
async def validate_config(request: Request):
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 64 * 1024:
            raise HTTPException(413, detail="Cấu hình vượt giới hạn 64 KB.")
    from pydantic import ValidationError
    try:
        config = DetectionConfig.model_validate_json(body)
        validate_rules(config)
        return {"valid": True}
    except ValidationError as exc:
        raise HTTPException(422, detail="Cấu hình không hợp lệ.") from exc
    except RuleValidationError as exc:
        raise HTTPException(422, detail=str(exc)) from exc


@router.post(
    "/scan", response_model=ScanResult,
    responses={413: {"description": "Image exceeds 10 MB"}, 415: {"description": "Unsupported MIME type"},
               422: {"description": "Invalid image/config"}, 503: {"description": "OCR unavailable/busy"},
               504: {"description": "OCR processing failed or timed out"}},
    openapi_extra={"requestBody": {"required": True, "content": {"multipart/form-data": {"schema": {
        "type": "object", "required": ["image", "config"], "properties": {
            "image": {"type": "string", "format": "binary"}, "config": {"type": "string", "description": "DetectionConfig JSON"}
        }
    }}}}},
)
async def scan(request: Request):
    """Real local Tesseract OCR + context detection. Returns masked previews, never raw OCR text."""
    acquired = False
    try:
        try:
            await asyncio.wait_for(scan_slots.acquire(), timeout=.05)
            acquired = True
        except TimeoutError as exc:
            raise HTTPException(503, detail="Bộ OCR đang bận. Vui lòng thử lại sau.") from exc
        payload, config, content_type = await read_scan_form(request)
        return await run_in_threadpool(scan_image, payload, config, content_type)
    except ImageValidationError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    except OCRUnavailableError as exc:
        raise HTTPException(503, detail={"code": "OCR_UNAVAILABLE", "message": str(exc)}) from exc
    except OCRProcessingError as exc:
        raise HTTPException(504, detail={"code": "OCR_FAILED", "message": str(exc)}) from exc
    except RuleValidationError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    finally:
        if acquired:
            scan_slots.release()
