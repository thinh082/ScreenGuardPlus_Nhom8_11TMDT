"""Security Policy Engine for ScreenGuard+ (DLP).

Evaluates whether an image can be safely exported according to sharing context
(PUBLIC vs INTERNAL) and mandatory redaction rules.
"""

from __future__ import annotations

from core.models import BoundingBox, Finding, PolicyResult

REASON_DESCRIPTIONS = {
    "SECRET_REDACTION_REQUIRED": "Bắt buộc che bí mật hệ thống, mật khẩu và khóa riêng tư trước khi chia sẻ.",
    "CITIZEN_ID_REDACTION_REQUIRED": "Bắt buộc che số Căn cước công dân trước khi chia sẻ công khai.",
    "FINANCIAL_DATA_REDACTION_REQUIRED": "Bắt buộc che số tài khoản ngân hàng trước khi chia sẻ công khai.",
    "SENSITIVE_PII_INTERNAL_WARNING": "Ảnh chứa CCCD hoặc tài khoản ngân hàng. Cần xác nhận trước khi chia sẻ nội bộ.",
    "INTERNAL_DATA_WARNING": "Ảnh còn chứa thông tin cá nhân hoặc địa chỉ mạng nội bộ chưa che.",
    "LOW_CONFIDENCE_REVIEW": "Có vùng nhận diện độ tin cậy thấp, cần kiểm tra kỹ trước khi chia sẻ.",
    "EXPORT_ALLOWED": "Đáp ứng các quy tắc xuất ảnh hiện tại; cần kiểm tra lại thông tin có thể bị OCR bỏ sót.",
}


def is_box_covered(finding_box: BoundingBox, redactions: list[BoundingBox]) -> bool:
    """Require complete union coverage; overlaps cannot be counted twice."""
    fx1 = finding_box.x
    fy1 = finding_box.y
    fx2 = fx1 + finding_box.width
    fy2 = fy1 + finding_box.height

    rectangles = []
    for r in redactions:
        rx1, ry1, rx2, ry2 = r.x, r.y, r.x + r.width, r.y + r.height
        ix1 = max(fx1, rx1)
        iy1 = max(fy1, ry1)
        ix2 = min(fx2, rx2)
        iy2 = min(fy2, ry2)
        if ix2 > ix1 and iy2 > iy1:
            rectangles.append((ix1, iy1, ix2, iy2))
    edges = sorted({fx1, fx2, *(x for r in rectangles for x in (r[0], r[2]))})
    for left, right in zip(edges, edges[1:]):
        if left == right:
            continue
        intervals = sorted(
            (y1, y2) for x1, y1, x2, y2 in rectangles if x1 <= left and x2 >= right
        )
        covered_to = fy1
        for top, bottom in intervals:
            if top > covered_to:
                return False
            covered_to = max(covered_to, bottom)
        if covered_to < fy2:
            return False
    return True


def evaluate_policy(
    findings: list[Finding],
    redactions: list[BoundingBox] | None = None,
    destination: str = "public",
    confirmed_warnings: list[str] | None = None,
    profile: str = "personal",
) -> PolicyResult:
    """Evaluates security policy for a set of findings and redactions.

    - PUBLIC sharing (security profile; personal PII remains confirmable):
        * CRITICAL (Secrets, Passwords, Private Keys) -> MANDATORY BLOCK
        * CITIZEN_ID, BANK_ACCOUNT -> MANDATORY BLOCK
        * HIGH/MEDIUM/LOW (Email, Phone, MSSV, Internal IP, JWT) -> WARN (allowable if confirmed)
        * Low confidence OCR (< 0.35) -> WARN

    - INTERNAL sharing:
        * CRITICAL (Secrets, Passwords, Private Keys) -> MANDATORY BLOCK
        * CITIZEN_ID, BANK_ACCOUNT -> WARN (allowable if confirmed)
        * Email, Phone, Student ID, Internal IP -> WARN or ALLOW if confirmed
    """
    redaction_list = redactions or []
    confirmed_set = set(confirmed_warnings or [])

    unredacted_critical: list[Finding] = []
    unredacted_cccd: list[Finding] = []
    unredacted_bank: list[Finding] = []
    unredacted_warning: list[Finding] = []
    low_confidence_unredacted: list[Finding] = []

    for f in findings:
        if is_box_covered(f.box, redaction_list):
            continue

        if f.risk == "critical":
            unredacted_critical.append(f)
        elif f.type == "cccd":
            if profile == "security":
                unredacted_cccd.append(f)
            else:
                unredacted_warning.append(f)
        elif f.type == "bank":
            if profile == "security":
                unredacted_bank.append(f)
            else:
                unredacted_warning.append(f)
        else:
            unredacted_warning.append(f)

        if f.ocr_confidence < 0.35:
            low_confidence_unredacted.append(f)

    reasons: list[str] = []
    blocked_ids: list[str] = []

    if destination == "public":
        # Mandatory BLOCK conditions for PUBLIC
        if unredacted_critical:
            reasons.append("SECRET_REDACTION_REQUIRED")
            blocked_ids.extend(f.id for f in unredacted_critical)
        if unredacted_cccd:
            reasons.append("CITIZEN_ID_REDACTION_REQUIRED")
            blocked_ids.extend(f.id for f in unredacted_cccd)
        if unredacted_bank:
            reasons.append("FINANCIAL_DATA_REDACTION_REQUIRED")
            blocked_ids.extend(f.id for f in unredacted_bank)

        if reasons:
            return PolicyResult(
                decision="BLOCK",
                reasons=reasons,
                unredacted_mandatory_count=len(blocked_ids),
                unredacted_warning_count=len(unredacted_warning),
                blocked_findings=blocked_ids,
            )

        # Warning conditions for PUBLIC
        warn_reasons: list[str] = []
        if unredacted_warning:
            warn_reasons.append("INTERNAL_DATA_WARNING")
        if low_confidence_unredacted:
            warn_reasons.append("LOW_CONFIDENCE_REVIEW")

        if warn_reasons and not all(r in confirmed_set for r in warn_reasons):
            return PolicyResult(
                decision="WARN",
                reasons=warn_reasons,
                unredacted_mandatory_count=0,
                unredacted_warning_count=len(unredacted_warning)
                + len(low_confidence_unredacted),
                blocked_findings=[],
            )

        return PolicyResult(
            decision="ALLOW",
            reasons=["EXPORT_ALLOWED"],
            unredacted_mandatory_count=0,
            unredacted_warning_count=0,
            blocked_findings=[],
        )

    # INTERNAL sharing policy
    if unredacted_critical:
        # Critical credentials can never be shared, even internally
        reasons.append("SECRET_REDACTION_REQUIRED")
        blocked_ids.extend(f.id for f in unredacted_critical)
        return PolicyResult(
            decision="BLOCK",
            reasons=reasons,
            unredacted_mandatory_count=len(blocked_ids),
            unredacted_warning_count=len(unredacted_warning),
            blocked_findings=blocked_ids,
        )

    internal_warn_reasons: list[str] = []
    if unredacted_cccd or unredacted_bank:
        internal_warn_reasons.append("SENSITIVE_PII_INTERNAL_WARNING")
    if unredacted_warning:
        internal_warn_reasons.append("INTERNAL_DATA_WARNING")
    if low_confidence_unredacted:
        internal_warn_reasons.append("LOW_CONFIDENCE_REVIEW")

    if internal_warn_reasons and not all(
        r in confirmed_set for r in internal_warn_reasons
    ):
        return PolicyResult(
            decision="WARN",
            reasons=internal_warn_reasons,
            unredacted_mandatory_count=0,
            unredacted_warning_count=len(unredacted_cccd)
            + len(unredacted_bank)
            + len(unredacted_warning),
            blocked_findings=[],
        )

    return PolicyResult(
        decision="ALLOW",
        reasons=["EXPORT_ALLOWED"],
        unredacted_mandatory_count=0,
        unredacted_warning_count=0,
        blocked_findings=[],
    )
