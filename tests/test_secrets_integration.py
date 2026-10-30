"""Synthetic screenshots -> real Tesseract -> shared API/agent detection.

Values below are fictitious test data, not expected OCR outputs or active keys.
"""

from io import BytesIO
from pathlib import Path
import json
import time

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont
import pytest

from backend.main import create_app
from core.models import DetectionConfig
from core.ocr import get_ocr_status
from core.pipeline import run_pipeline
from desktop_agent.controller import Companion

pytestmark = pytest.mark.skipif(
    not get_ocr_status()["ocr_available"], reason="Real Tesseract unavailable"
)


def screenshot(*lines):
    font_path = next(
        (
            str(p)
            for p in [
                Path("C:/Windows/Fonts/consola.ttf"),
                Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
            ]
            if p.is_file()
        ),
        None,
    )
    if not font_path:
        pytest.skip("A scalable monospace font is required for OCR integration")
    font = ImageFont.truetype(font_path, 30)
    width = int(max(font.getlength(line) for line in lines)) + 80
    image = Image.new("RGB", (max(800, width), max(150, 60 + len(lines) * 56)), "white")
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(lines):
        draw.text((35, 25 + index * 56), line, font=font, fill="black")
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


@pytest.mark.parametrize(
    "text,expected",
    [
        ("DATABASE_PASSWORD=DemoPass123!", "DB_CREDENTIAL"),
        ("DATABASE PASSWORD = DemoPass123!", "DB_CREDENTIAL"),
        ('"DATABASE_PASSWORD": "DemoPass123!"', "DB_CREDENTIAL"),
        (
            "Server=localhost;Database=Demo;User Id=demo;Password=DemoPass123!;",
            "DB_CREDENTIAL",
        ),
        ("postgresql://demo:DemoPass123!@localhost:5432/demo", "DB_CREDENTIAL"),
        ("redis://:DemoPass123!@localhost:6379", "DB_CREDENTIAL"),
        ("API_KEY=DemoApiKey1234567890ABCDEF", "API_KEY"),
        ("ACCESS_TOKEN=DemoAccessToken1234567890ABCDEF", "API_KEY"),
        ("Authorization: Bearer DemoBearerToken1234567890ABCDEF", "API_KEY"),
        (
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkZW1vLXVzZXIifQ.DemoSignature1234567890ABCDE",
            "JWT_TOKEN",
        ),
    ],
)
def test_real_ocr_secret_categories_in_default_personal_profile(text, expected):
    result = run_pipeline(
        screenshot(text), DetectionConfig(language="eng"), "image/png"
    )
    assert any(f.type == expected for f in result.findings)
    assert "DemoPass123!" not in result.model_dump_json()
    assert "DemoApiKey1234567890ABCDEF" not in result.model_dump_json()
    assert all(
        0 <= f.bbox[0] < f.bbox[2] <= result.width
        and 0 <= f.bbox[1] < f.bbox[3] <= result.height
        for f in result.findings
    )


def test_real_private_key_block_is_masked():
    result = run_pipeline(
        screenshot(
            "-----BEGIN PRIVATE KEY-----",
            "MIIBDemoPrivateMaterial1234567890ABCDEF1234567890",
            "-----END PRIVATE KEY-----",
        ),
        DetectionConfig(language="eng"),
        "image/png",
    )
    assert len(result.findings) >= 2
    assert all(f.type == "PRIVATE_KEY" for f in result.findings)
    assert "MIIBDemoPrivateMaterial" not in result.model_dump_json()


def test_real_password_api_masking_type_toggle_and_pii_coexistence():
    image = screenshot(
        "DATABASE_PASSWORD=DemoPass123!", "Contact: privacy.test@example.com"
    )
    with TestClient(create_app()) as client:
        result = client.post(
            "/api/scan",
            files={"image": ("screenshot.png", image, "image/png")},
            data={"config": DetectionConfig(language="eng").model_dump_json()},
        )
        assert result.status_code == 200
        assert {f["type"] for f in result.json()["findings"]} == {
            "DB_CREDENTIAL",
            "EMAIL",
        }
        assert "DemoPass123!" not in result.text
        assert "privacy.test@example.com" not in result.text
        config = DetectionConfig(language="eng")
        config.types.db_credential = False
        disabled = client.post(
            "/api/scan",
            files={"image": ("screenshot.png", image, "image/png")},
            data={"config": config.model_dump_json()},
        )
        assert {f["type"] for f in disabled.json()["findings"]} == {"EMAIL"}


def test_real_clean_config_does_not_invent_secrets():
    result = run_pipeline(
        screenshot(
            "DATABASE_PASSWORD=null",
            "PORT=8000",
            "API_KEY=******",
            "PUBLIC_MESSAGE=Hello",
        ),
        DetectionConfig(language="eng"),
        "image/png",
    )
    assert result.findings == []


def test_real_new_windows_file_triggers_secret_notification_with_legacy_settings(
    tmp_path,
):
    folder = tmp_path / "Screenshots"
    folder.mkdir()
    path = tmp_path / "companion.json"
    # Pre-Phase-5 settings must continue working, without requiring profile edits.
    path.write_text(
        json.dumps(
            {"folder": str(folder), "enabled": True, "config": {"language": "eng"}}
        ),
        encoding="utf-8",
    )

    class Recorder:
        last_status = "not_sent"

        def __init__(self):
            self.items = []

        def notify(self, count, key):
            self.items.append((count, key))
            self.last_status = "submitted"

        def clear(self):
            pass

    recorder = Recorder()
    agent = Companion("http://127.0.0.1:8015", path=path, notifier=recorder)
    try:
        agent.start()
        assert agent.status()["running"] is True
        payload = screenshot("DATABASE_PASSWORD=DemoPass123!")
        (folder / "new-secret.png").write_bytes(payload)
        end = time.monotonic() + 12
        while not recorder.items and time.monotonic() < end:
            time.sleep(0.05)
        assert recorder.items and recorder.items[0][0] == 1
        review = agent.reviews.get(recorder.items[0][1])
        assert review.result.findings[0].type == "DB_CREDENTIAL"
        assert review.result.findings[0].risk == "CRITICAL"
        assert "DemoPass123!" not in review.result.model_dump_json()
        assert (
            agent.status()["notification"] == "submitted"
            and agent.status()["error"] is None
        )
        (folder / "duplicate.png").write_bytes(payload)
        end = time.monotonic() + 3
        while agent.status()["duplicates"] == 0 and time.monotonic() < end:
            time.sleep(0.05)
        assert agent.status()["duplicates"] >= 1 and len(recorder.items) == 1
        agent.enable(False)
        (folder / "after-stop.png").write_bytes(
            screenshot("DATABASE_PASSWORD=DifferentDemo123!")
        )
        time.sleep(1)
        assert agent.status()["running"] is False and len(recorder.items) == 1
    finally:
        agent.close()
