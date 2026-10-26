"""Bounded multipart parsing, kept in RAM for supported upload sizes."""
from fastapi import HTTPException, Request
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser
from pydantic import ValidationError
from python_multipart.exceptions import MultipartParseError

from core.models import DetectionConfig
from core.rules import RuleValidationError, validate_rules
from core.validator import MAX_BYTES

MAX_CONFIG_BYTES = 64 * 1024
MAX_REQUEST_BYTES = MAX_BYTES + MAX_CONFIG_BYTES + 8192


class MemoryMultipartParser(MultiPartParser):
    spool_max_size = MAX_REQUEST_BYTES


async def read_scan_form(request: Request):
    if not request.headers.get("content-type", "").lower().startswith("multipart/form-data;"):
        raise HTTPException(415, detail="Cần gửi multipart/form-data với image và config.")
    size = 0

    async def bounded_stream():
        nonlocal size
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_REQUEST_BYTES:
                # Parser closes pending temporary handles when MultiPartException is raised.
                raise MultiPartException("UPLOAD_TOO_LARGE")
            yield chunk

    form = None
    try:
        form = await MemoryMultipartParser(request.headers, bounded_stream(), max_files=1,
                                          max_fields=1, max_part_size=MAX_CONFIG_BYTES).parse()
        if set(form.keys()) != {"image", "config"} or len(form.multi_items()) != 2:
            raise HTTPException(422, detail="Cần đúng một ảnh image và một cấu hình config.")
        image, raw_config = form["image"], form["config"]
        if not isinstance(image, UploadFile) or not isinstance(raw_config, str):
            raise HTTPException(422, detail="Trường image/config không hợp lệ.")
        payload = await image.read(MAX_BYTES + 1)
        if len(payload) > MAX_BYTES:
            raise HTTPException(413, detail="Ảnh vượt quá giới hạn 10 MB.")
        if image.content_type not in {"image/png", "image/jpeg", "image/webp"}:
            raise HTTPException(415, detail="Chỉ hỗ trợ PNG, JPEG và WebP.")
        config = DetectionConfig.model_validate_json(raw_config)
        validate_rules(config)
        return payload, config, image.content_type
    except (MultiPartException, MultipartParseError) as exc:
        raise HTTPException(413 if getattr(exc,"message",None) == "UPLOAD_TOO_LARGE" else 422,
                            detail="Ảnh vượt quá 10 MB hoặc multipart không hợp lệ/đúng giới hạn.") from exc
    except ValidationError as exc:
        # Pydantic errors can contain the input (PII/config); never echo that input.
        raise HTTPException(422, detail="JSON cấu hình không hợp lệ hoặc vượt giới hạn.") from exc
    except RuleValidationError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    finally:
        if form is not None:
            await form.close()
