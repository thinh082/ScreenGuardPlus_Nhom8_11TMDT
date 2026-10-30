"""Redaction verification and secure export enforcement.

Verifies opaque redaction, strips metadata, and generates an integrity SHA-256 hash.
Ensures policy compliance cannot be bypassed.
"""

from __future__ import annotations

import hashlib
from io import BytesIO

from PIL import Image, ImageDraw, ImageOps

from core.models import BoundingBox, ExportVerificationResult
from core.policy_engine import evaluate_policy, is_box_covered
from core.ticket_store import ScanTicket
from core.validator import ImageValidationError, validate_image

REDACTION_RGBA = (17, 24, 39, 255)


class PolicyBlockedError(RuntimeError):
    def __init__(self, reasons: list[str], blocked_findings: list[str]) -> None:
        super().__init__("Xuất ảnh bị chặn theo chính sách bảo mật.")
        self.reasons = reasons
        self.blocked_findings = blocked_findings


class PolicyConfirmationRequiredError(RuntimeError):
    def __init__(self, reasons: list[str]) -> None:
        super().__init__("Cần xác nhận cảnh báo trước khi xuất ảnh.")
        self.reasons = reasons


def verify_and_export(
    ticket: ScanTicket,
    redaction_boxes: list[BoundingBox],
    destination: str = "public",
    confirmed_warnings: list[str] | None = None,
) -> tuple[bytes, ExportVerificationResult]:
    """Applies secure policy-compliant export for a valid scan ticket."""
    if hashlib.sha256(ticket.image_bytes).hexdigest() != ticket.image_sha256:
        raise ImageValidationError("Scan ticket image integrity check failed")
    if any(
        box.x + box.width > ticket.width or box.y + box.height > ticket.height
        for box in redaction_boxes
    ):
        raise ImageValidationError("Redaction is outside the image")
    # 1. Evaluate policy based on server-verified findings in ticket
    policy_result = evaluate_policy(
        findings=ticket.findings,
        redactions=redaction_boxes,
        destination=destination,
        confirmed_warnings=confirmed_warnings,
        profile=ticket.profile,
    )

    if policy_result.decision == "BLOCK":
        raise PolicyBlockedError(
            reasons=policy_result.reasons,
            blocked_findings=policy_result.blocked_findings,
        )

    if policy_result.decision == "WARN":
        raise PolicyConfirmationRequiredError(reasons=policy_result.reasons)

    # 2. Perform opaque server-side redaction
    validate_image(ticket.image_bytes)
    with Image.open(BytesIO(ticket.image_bytes)) as source:
        oriented = ImageOps.exif_transpose(source)
        rgba = oriented.convert("RGBA")
        if rgba.size != (ticket.width, ticket.height):
            raise ImageValidationError("Scan ticket dimensions do not match image")
        output_image = Image.new("RGBA", oriented.size, "white")
        output_image.paste(rgba, mask=rgba.getchannel("A"))
        draw = ImageDraw.Draw(output_image)

        for box in redaction_boxes:
            draw.rectangle(
                (box.x, box.y, box.x + box.width - 1, box.y + box.height - 1),
                fill=REDACTION_RGBA,
            )

        # 3. Verify every pixel of each covered finding, not just its center.
        verification_warnings: list[str] = []
        for finding in ticket.findings:
            if is_box_covered(finding.box, redaction_boxes):
                box = finding.box
                region = output_image.crop(
                    (box.x, box.y, box.x + box.width, box.y + box.height)
                )
                if region.getextrema() != tuple((c, c) for c in REDACTION_RGBA):
                    raise ImageValidationError("Redaction verification failed")

        # 4. Fresh PNG encoding without metadata / EXIF
        output_buffer = BytesIO()
        output_image.save(output_buffer, format="PNG", optimize=True)
        final_png = output_buffer.getvalue()

    # 5. Compute cryptographic integrity hash
    export_hash = hashlib.sha256(final_png).hexdigest()

    result = ExportVerificationResult(
        verified=len(verification_warnings) == 0,
        image_hash=export_hash,
        width=ticket.width,
        height=ticket.height,
        decision="ALLOW",
        reasons=policy_result.reasons,
        warnings=verification_warnings,
    )

    return final_png, result
