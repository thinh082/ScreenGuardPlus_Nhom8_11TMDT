import asyncio

from fastapi import APIRouter, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool

from backend.api.uploads import read_scan_form
from backend.services.scanner import scan_image
from core.export_verifier import (
    PolicyBlockedError,
    PolicyConfirmationRequiredError,
    verify_and_export,
)
from core.models import DetectionConfig, ExportRequest, PolicyResult, ScanResult
from core.ocr import OCRProcessingError, OCRUnavailableError, get_ocr_status
from core.policy_engine import evaluate_policy
from core.rules import RuleValidationError, validate_rules
from core.ticket_store import ticket_store
from core.validator import ImageValidationError

router = APIRouter()
scan_slots = asyncio.Semaphore(2)


@router.get("/health")
def health():
    return {
        "status": "ok",
        "backend_available": True,
        "phase": 5,
        **get_ocr_status(),
        "detector_available": True,
        "secrets_detector_available": True,
        "policy_enforcement": True,
        "stores_images": False,
        "temporary_image_storage": "bounded_ram_10_minutes",
        "processing": "python_backend",
    }


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
    "/scan",
    response_model=ScanResult,
    responses={
        413: {"description": "Image exceeds 10 MB"},
        415: {"description": "Unsupported MIME type"},
        422: {"description": "Invalid image/config"},
        503: {"description": "OCR unavailable/busy"},
        504: {"description": "OCR processing failed or timed out"},
    },
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["image", "config"],
                        "properties": {
                            "image": {"type": "string", "format": "binary"},
                            "config": {
                                "type": "string",
                                "description": "DetectionConfig JSON",
                            },
                        },
                    }
                }
            },
        }
    },
)
async def scan(request: Request):
    """Real local Tesseract OCR + PII & Secrets detection. Returns masked previews."""
    acquired = False
    try:
        try:
            await asyncio.wait_for(scan_slots.acquire(), timeout=0.05)
            acquired = True
        except TimeoutError as exc:
            raise HTTPException(
                503, detail="Bộ OCR đang bận. Vui lòng thử lại sau."
            ) from exc
        payload, config, content_type = await read_scan_form(request)
        return await run_in_threadpool(scan_image, payload, config, content_type)
    except ImageValidationError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    except OCRUnavailableError as exc:
        raise HTTPException(
            503, detail={"code": "OCR_UNAVAILABLE", "message": str(exc)}
        ) from exc
    except OCRProcessingError as exc:
        raise HTTPException(
            504, detail={"code": "OCR_FAILED", "message": str(exc)}
        ) from exc
    except RuleValidationError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    finally:
        if acquired:
            scan_slots.release()


@router.post("/policy/evaluate", response_model=PolicyResult)
def evaluate_policy_endpoint(request: ExportRequest):
    """Evaluates security policy for a given ticket and redactions in real-time."""
    ticket = ticket_store.get_ticket(request.ticket)
    if not ticket:
        raise HTTPException(
            422,
            detail={
                "code": "INVALID_TICKET",
                "message": "Phiên kiểm tra không hợp lệ hoặc đã hết hạn.",
            },
        )
    return evaluate_policy(
        findings=ticket.findings,
        redactions=request.redactions,
        destination=request.destination,
        confirmed_warnings=request.confirmed_warnings,
        profile=ticket.profile,
    )


@router.post(
    "/export",
    responses={
        200: {"content": {"image/png": {}}},
        400: {"description": "Confirmation required for policy warnings"},
        403: {"description": "Policy blocked due to unredacted mandatory data"},
        422: {"description": "Invalid ticket or redaction"},
    },
)
async def export_image(request: ExportRequest):
    """Performs server-side verified redaction and policy-enforced PNG export."""
    ticket = ticket_store.get_ticket(request.ticket)
    if not ticket:
        raise HTTPException(
            422,
            detail={
                "code": "INVALID_TICKET",
                "message": "Phiên kiểm tra không hợp lệ hoặc đã hết hạn. Vui lòng quét lại ảnh.",
            },
        )
    try:
        png_bytes, verification = await run_in_threadpool(
            verify_and_export,
            ticket,
            request.redactions,
            request.destination,
            request.confirmed_warnings,
        )
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "X-Image-Hash": verification.image_hash,
                "X-Policy-Decision": verification.decision,
                "Content-Disposition": 'attachment; filename="screenguard-protected.png"',
                "Cache-Control": "no-store",
            },
        )
    except PolicyBlockedError as exc:
        raise HTTPException(
            403,
            detail={
                "code": "POLICY_BLOCKED",
                "decision": "BLOCK",
                "message": "Xuất ảnh bị chặn theo chính sách bảo mật do còn thông tin bắt buộc che.",
                "reasons": exc.reasons,
                "blocked_findings": exc.blocked_findings,
            },
        ) from exc
    except PolicyConfirmationRequiredError as exc:
        raise HTTPException(
            400,
            detail={
                "code": "CONFIRMATION_REQUIRED",
                "decision": "WARN",
                "message": "Cần xác nhận các cảnh báo chính sách trước khi xuất ảnh.",
                "reasons": exc.reasons,
            },
        ) from exc
    except ImageValidationError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
