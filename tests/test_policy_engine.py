from core.models import BoundingBox, Finding
from core.policy_engine import evaluate_policy, is_box_covered


def make_finding(kind, risk="high", x=10, y=10, width=100, height=30, confidence=0.9):
    return Finding(
        id=f"f-{kind}",
        type=kind,
        label=kind,
        text="***",
        risk=risk,
        box=BoundingBox(x=x, y=y, width=width, height=height),
        ocr_confidence=confidence,
    )


def test_is_box_covered():
    f_box = BoundingBox(x=10, y=10, width=100, height=30)
    # Exact box covers
    assert is_box_covered(f_box, [BoundingBox(x=10, y=10, width=100, height=30)])
    # Enclosing box covers
    assert is_box_covered(f_box, [BoundingBox(x=8, y=8, width=105, height=35)])
    # Non-overlapping does not cover
    assert not is_box_covered(f_box, [BoundingBox(x=200, y=200, width=50, height=50)])
    # Partial cover does not cover
    assert not is_box_covered(f_box, [BoundingBox(x=10, y=10, width=30, height=30)])


def test_overlapping_duplicate_redactions_do_not_bypass_full_coverage():
    box = BoundingBox(x=10, y=10, width=100, height=30)
    half = BoundingBox(x=10, y=10, width=50, height=30)
    assert not is_box_covered(box, [half, half])
    assert not is_box_covered(box, [BoundingBox(x=11, y=10, width=99, height=30)])
    assert is_box_covered(box, [half, BoundingBox(x=60, y=10, width=50, height=30)])


def test_personal_profile_preserves_pii_selection_with_confirmation():
    result = evaluate_policy([make_finding("bank")], profile="personal")
    assert result.decision == "WARN"
    assert (
        evaluate_policy(
            [make_finding("bank")],
            profile="personal",
            confirmed_warnings=result.reasons,
        ).decision
        == "ALLOW"
    )


def test_TC06_public_unredacted_secret_blocks():
    secret_finding = make_finding("db_credential", risk="critical")
    result = evaluate_policy(
        findings=[secret_finding], redactions=[], destination="public"
    )
    assert result.decision == "BLOCK"
    assert "SECRET_REDACTION_REQUIRED" in result.reasons
    assert secret_finding.id in result.blocked_findings


def test_TC07_public_redacted_secret_allows():
    secret_finding = make_finding(
        "db_credential", risk="critical", x=20, y=20, width=80, height=25
    )
    redaction = BoundingBox(x=18, y=18, width=85, height=30)
    result = evaluate_policy(
        findings=[secret_finding], redactions=[redaction], destination="public"
    )
    assert result.decision == "ALLOW"
    assert "EXPORT_ALLOWED" in result.reasons
    assert result.unredacted_mandatory_count == 0


def test_TC08_internal_sharing_policy():
    email_finding = make_finding("email", risk="high")
    # In internal, email without confirmation yields WARN
    res_warn = evaluate_policy(
        findings=[email_finding], redactions=[], destination="internal"
    )
    assert res_warn.decision == "WARN"
    assert "INTERNAL_DATA_WARNING" in res_warn.reasons

    # After user confirms warning reason, export is ALLOWED
    res_allow = evaluate_policy(
        findings=[email_finding],
        redactions=[],
        destination="internal",
        confirmed_warnings=["INTERNAL_DATA_WARNING"],
    )
    assert res_allow.decision == "ALLOW"

    # But unredacted CRITICAL secret in internal STILL blocks!
    secret_finding = make_finding("api_key", risk="critical")
    res_block = evaluate_policy(
        findings=[email_finding, secret_finding],
        redactions=[],
        destination="internal",
        confirmed_warnings=["INTERNAL_DATA_WARNING"],
    )
    assert res_block.decision == "BLOCK"
    assert "SECRET_REDACTION_REQUIRED" in res_block.reasons


def test_public_cccd_and_bank_mandatory_block():
    cccd = make_finding("cccd", risk="high")
    bank = make_finding("bank", risk="high")
    result = evaluate_policy(
        findings=[cccd, bank], redactions=[], destination="public", profile="security"
    )
    assert result.decision == "BLOCK"
    assert "CITIZEN_ID_REDACTION_REQUIRED" in result.reasons
    assert "FINANCIAL_DATA_REDACTION_REQUIRED" in result.reasons
