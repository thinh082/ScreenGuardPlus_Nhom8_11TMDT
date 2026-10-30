from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from backend.main import app
from core.models import BoundingBox, DetectionConfig, Finding
from core.ticket_store import ticket_store

client = TestClient(app)


def make_dummy_png(size=(100, 100), color=(255, 255, 255)):
    buf = BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def test_TC09_client_tampering_rejected_by_server_policy():
    # Store a ticket on server with a critical secret finding
    image_bytes = make_dummy_png()
    secret_finding = Finding(
        id="real-secret-123",
        type="db_credential",
        label="Database Password",
        text="***",
        risk="critical",
        box=BoundingBox(x=10, y=10, width=50, height=20),
    )
    ticket = ticket_store.create_ticket(
        image_bytes=image_bytes,
        findings=[secret_finding],
        width=100,
        height=100,
    )

    # Client attempts to export without redacting the secret
    response = client.post(
        "/api/export",
        json={
            "ticket": ticket.ticket_id,
            "destination": "public",
            "redactions": [],
        },
    )
    assert response.status_code == 403
    data = response.json()
    assert data["detail"]["code"] == "POLICY_BLOCKED"
    assert "SECRET_REDACTION_REQUIRED" in data["detail"]["reasons"]


def test_TC10_invalid_or_expired_ticket_rejected():
    response = client.post(
        "/api/export",
        json={
            "ticket": "non-existent-ticket-id",
            "destination": "public",
            "redactions": [],
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_TICKET"


def test_TC11_TC12_secure_export_opaque_and_sha256():
    image_bytes = make_dummy_png((100, 100), color=(255, 255, 255))
    secret_finding = Finding(
        id="secret-1",
        type="db_credential",
        label="Password",
        text="***",
        risk="critical",
        box=BoundingBox(x=20, y=20, width=40, height=20),
    )
    ticket = ticket_store.create_ticket(
        image_bytes=image_bytes,
        findings=[secret_finding],
        width=100,
        height=100,
    )

    # Client covers the secret
    response = client.post(
        "/api/export",
        json={
            "ticket": ticket.ticket_id,
            "destination": "public",
            "redactions": [{"x": 18, "y": 18, "width": 45, "height": 25}],
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert "X-Image-Hash" in response.headers
    assert response.headers["X-Policy-Decision"] == "ALLOW"

    # Verify pixels in exported PNG: center of redacted region is #111827 (17, 24, 39, 255)
    exported_img = Image.open(BytesIO(response.content))
    assert exported_img.getpixel((30, 25)) == (17, 24, 39, 255)
    # Untouched region remains white
    assert exported_img.getpixel((5, 5)) == (255, 255, 255, 255)
    # EXIF stripped
    assert not exported_img.getexif()


def test_TC13_personal_profile_backward_compatibility():
    # Legacy settings still default to personal; credential detection is on.
    config = DetectionConfig(profile="personal")
    assert config.profile == "personal"
    assert config.types.db_credential is True
    res = client.get("/api/config")
    assert res.status_code == 200
    assert res.json()["profile"] == "personal"


def test_TC16_low_confidence_review_warning():
    image_bytes = make_dummy_png()
    low_conf_finding = Finding(
        id="f-low",
        type="email",
        label="Email",
        text="***",
        risk="medium",
        box=BoundingBox(x=10, y=10, width=50, height=20),
        ocr_confidence=0.15,
    )
    ticket = ticket_store.create_ticket(
        image_bytes=image_bytes,
        findings=[low_conf_finding],
        width=100,
        height=100,
    )

    # Without confirmation -> 400 CONFIRMATION_REQUIRED
    response = client.post(
        "/api/export",
        json={
            "ticket": ticket.ticket_id,
            "destination": "public",
            "redactions": [],
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "CONFIRMATION_REQUIRED"

    # With user confirmation -> 200 OK
    response_ok = client.post(
        "/api/export",
        json={
            "ticket": ticket.ticket_id,
            "destination": "public",
            "confirmed_warnings": ["LOW_CONFIDENCE_REVIEW", "INTERNAL_DATA_WARNING"],
            "redactions": [],
        },
    )
    assert response_ok.status_code == 200


def test_out_of_bounds_redaction_is_rejected_instead_of_silently_skipped():
    ticket = ticket_store.create_ticket(make_dummy_png(), [], 100, 100)
    response = client.post(
        "/api/export",
        json={
            "ticket": ticket.ticket_id,
            "redactions": [{"x": 90, "y": 90, "width": 20, "height": 20}],
        },
    )
    assert response.status_code == 422


def test_scan_ticket_memory_budget_and_idle_expiry():
    import time
    from core.ticket_store import TicketStore

    store = TicketStore(max_size=3, max_bytes=10, ttl=0.15)
    first = store.create_ticket(b"123456", [], 1, 1)
    second = store.create_ticket(b"abcdef", [], 1, 1)
    assert store.get_ticket(first.ticket_id) is None
    assert store.get_ticket(second.ticket_id)
    time.sleep(0.3)
    # Verify the timer purges bytes while idle, before another get/create call.
    with store._lock:
        assert store._tickets == {}
    store.clear()
