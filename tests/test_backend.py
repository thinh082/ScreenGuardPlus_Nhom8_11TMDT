from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from backend.main import app
from core.models import Finding, BoundingBox
from core.redactor import redact_image
from core.validator import ImageValidationError, validate_image
from core.ocr import OCRUnavailableError
from core.models import DetectionConfig

client = TestClient(app)


def image_bytes(size=(32, 24), fmt="PNG"):
    buffer = BytesIO()
    Image.new("RGB", size, "white").save(buffer, format=fmt)
    return buffer.getvalue()


def test_health_and_api_are_never_cached():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["detector_available"] is True
    assert isinstance(response.json()["tesseract_installed"], bool)
    assert isinstance(response.json()["languages"], list)
    assert response.headers["cache-control"] == "no-store"


def test_frontend_manifest_and_icons_are_served():
    assert 'lang="vi"' in client.get("/").text
    assert client.get("/manifest.webmanifest").json()["display"] == "standalone"
    for size in (192, 512):
        response = client.get(f"/icons/icon-{size}.png")
        assert response.status_code == 200
        assert Image.open(BytesIO(response.content)).size == (size, size)


def post_scan(payload, mime="image/png", config=None):
    return client.post("/api/scan", files={"image": ("photo.png", payload, mime)},
                       data={"config": (config or DetectionConfig()).model_dump_json()})


def test_scan_unavailable_is_explicit_and_private(monkeypatch):
    def unavailable(*args):
        raise OCRUnavailableError("Tesseract unavailable")
    monkeypatch.setattr("core.pipeline.extract_text", unavailable)
    response = post_scan(image_bytes())
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "OCR_UNAVAILABLE"
    assert response.headers["cache-control"] == "no-store"


def test_scan_validates_input_and_size():
    assert post_scan(b"invalid").status_code == 422
    assert post_scan(image_bytes(), "image/jpeg").status_code == 422
    assert post_scan(b"x", "text/plain").status_code == 415
    assert post_scan(b"x" * (10 * 1024 * 1024 + 1)).status_code == 413
    assert post_scan(image_bytes((5000,4100))).status_code == 422
    assert post_scan(image_bytes(fmt="GIF")).status_code == 422
    assert post_scan(image_bytes()[:40]).status_code == 422
    assert client.post("/api/scan",content=b"not a multipart body",headers={"Content-Type":"multipart/form-data; boundary=test"}).status_code == 422


def test_config_and_multipart_errors_do_not_echo_sensitive_input():
    response = client.post("/api/scan", files={"image":("photo.png",image_bytes(),"image/png")}, data={"config":"SENSITIVE_INVALID_CONFIG"})
    assert response.status_code == 422 and "SENSITIVE_INVALID_CONFIG" not in response.text
    assert client.post("/api/scan", data={"config":"{}"}).status_code == 415
    assert client.post("/api/config/validate",json={"unknown":"PRIVATE"}).status_code == 422
    config=DetectionConfig().model_dump()
    config["rules"]=[{"id":"1","name":"Regex","kind":"regex","pattern":"[","enabled":True,"risk":"high"}]
    assert client.post("/api/config/validate",json=config).status_code == 422
    assert client.post("/api/config/validate",json=DetectionConfig().model_dump()).json() == {"valid":True}


def test_image_validation_limits_and_format():
    assert validate_image(image_bytes()) == (32, 24)
    with pytest.raises(ImageValidationError):
        validate_image(image_bytes((5000, 4100)))
    with pytest.raises(ImageValidationError):
        validate_image(image_bytes(fmt="GIF"))


def test_redaction_is_opaque_and_preserves_unselected_pixels():
    finding = Finding(id="manual-1", type="manual", label="Test", text="", risk="high", box=BoundingBox(x=4, y=4, width=10, height=8))
    png = redact_image(image_bytes(), [finding])
    output = Image.open(BytesIO(png))
    assert output.getpixel((4, 4)) == (17, 24, 39, 255)
    assert output.getpixel((13, 11)) == (17, 24, 39, 255)
    assert output.getpixel((14, 12)) == (255, 255, 255, 255)
    assert not output.getexif()
    finding.box.x = 30
    with pytest.raises(ValueError):
        redact_image(image_bytes(), [finding])


def test_config_defaults_are_independent():
    config = client.get("/api/config").json()
    assert config["mode"] == "auto" and all(config["types"].values())
    assert config["rules"] == []
