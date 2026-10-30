from __future__ import annotations

import hashlib

from core.detector import detect_sensitive_text
from core.models import APIFinding, DetectionConfig, Finding, ScanResult
from core.ocr import extract_text
from core.policy_engine import evaluate_policy
from core.rules import validate_rules
from core.secrets_detector import detect_secrets
from core.ticket_store import ticket_store
from core.validator import validate_image

TYPE_MAP = {
    "email": "EMAIL",
    "phone": "PHONE",
    "cccd": "CITIZEN_ID",
    "student": "STUDENT_ID",
    "bank": "BANK_ACCOUNT",
    "custom": "CUSTOM",
    "db_credential": "DB_CREDENTIAL",
    "api_key": "API_KEY",
    "private_key": "PRIVATE_KEY",
    "jwt_token": "JWT_TOKEN",
    "internal_ip": "INTERNAL_IP",
}


def _dedup_findings(findings: list[Finding]) -> list[Finding]:
    """Sorts and deduplicates findings, giving priority to CRITICAL/HIGH secrets."""
    risk_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    sorted_items = sorted(
        findings,
        key=lambda f: (-risk_rank.get(f.risk, 0), -f.score, f.box.y, f.box.x),
    )
    result: list[Finding] = []
    for item in sorted_items:
        # Check significant overlap with existing kept finding
        ix1, iy1 = item.box.x, item.box.y
        ix2, iy2 = ix1 + item.box.width, iy1 + item.box.height
        overlap = False
        for kept in result:
            kx1, ky1 = kept.box.x, kept.box.y
            kx2, ky2 = kx1 + kept.box.width, ky1 + kept.box.height
            ox1, oy1 = max(ix1, kx1), max(iy1, ky1)
            ox2, oy2 = min(ix2, kx2), min(iy2, ky2)
            if ox2 > ox1 and oy2 > oy1:
                overlap_area = (ox2 - ox1) * (oy2 - oy1)
                item_area = item.box.width * item.box.height
                if item_area > 0 and overlap_area / item_area > 0.50:
                    overlap = True
                    break
        if not overlap:
            result.append(item)
    return sorted(result, key=lambda f: (f.box.y, f.box.x))


def run_pipeline(
    image: bytes, config: DetectionConfig, content_type: str
) -> ScanResult:
    validate_image(image, content_type)
    validate_rules(config)
    ocr_result = extract_text(image, config.language)

    # 1. PII detection
    findings = list(detect_sensitive_text(ocr_result, config))

    # Credentials must not silently disappear for existing personal-profile users
    # or agents whose saved settings predate Phase 5. Per-type toggles still apply.
    findings.extend(detect_secrets(ocr_result, config))

    findings = _dedup_findings(findings)

    # 3. Create ticket in ticket store for secure export
    ticket = ticket_store.create_ticket(
        image_bytes=image,
        findings=findings,
        width=ocr_result.width,
        height=ocr_result.height,
        content_type=content_type,
        profile=config.profile,
    )
    image_hash = hashlib.sha256(image).hexdigest()

    # 4. Evaluate initial policy status (before any redaction)
    policy = evaluate_policy(
        findings=findings,
        redactions=[],
        destination=config.destination,
        profile=config.profile,
    )

    public_findings = [
        APIFinding(
            id=f.id,
            type=TYPE_MAP.get(f.type, "CUSTOM"),  # type: ignore[arg-type]
            label=f.label,
            bbox=(f.box.x, f.box.y, f.box.x + f.box.width, f.box.y + f.box.height),
            risk=f.risk.upper(),  # type: ignore[arg-type]
            score=f.score,
            ocr_confidence=f.ocr_confidence,
            preview=f.preview,
            source=f.source,  # type: ignore[arg-type]
        )
        for f in findings
    ]

    message = (
        "Đã nhận diện văn bản. Kết quả tự động có thể bỏ sót thông tin; vui lòng kiểm tra lại ảnh trước khi chia sẻ."
        if findings
        else "Không phát hiện thông tin nhạy cảm. Vui lòng kiểm tra lại ảnh trước khi chia sẻ."
    )

    warnings = list(ocr_result.warnings)
    if any(f.ocr_confidence < 0.20 for f in findings):
        warnings.append(
            "Có vùng đọc chưa rõ, được đề xuất nhờ ngữ cảnh. Hãy kiểm tra kỹ hoặc đánh dấu bổ sung."
        )

    return ScanResult(
        width=ocr_result.width,
        height=ocr_result.height,
        findings=public_findings,
        language=ocr_result.language,
        warnings=warnings,
        message=message,
        profile=config.profile,
        destination=config.destination,
        scan_ticket=ticket.ticket_id,
        policy_decision=policy.decision,
        policy_reasons=policy.reasons,
        image_hash=image_hash,
    )
