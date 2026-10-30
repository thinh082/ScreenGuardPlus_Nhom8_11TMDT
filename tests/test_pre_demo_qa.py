"""Pre-demo regression: actual pixels -> real OCR -> public API / OS watcher."""

import hashlib
from io import BytesIO
import json
from pathlib import Path
import time

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from backend.main import create_app
from core.models import DetectionConfig
from core.ocr import get_ocr_status
from core.secrets_detector import detect_secrets
from desktop_agent.controller import Companion
from desktop_agent.settings import AgentSettings, save_settings
from tests.qa.corpus import CASES, Case, render
from tests.qa.measure import oracle
from tests.qa.measure import matched_counts

pytestmark = pytest.mark.skipif(
    not get_ocr_status()["ocr_available"], reason="Real Tesseract unavailable"
)


@pytest.mark.parametrize(
    "case",
    [
        c
        for c in CASES
        if c.id
        in {
            "password_definition_long",
            "password_placeholder_words",
            "api_definition",
            "token_definition",
            "api_placeholder",
        }
    ],
    ids=lambda c: c.id,
)
def test_reproduced_documentation_false_positives(case):
    image, boxes = render(case)
    # Exact text oracle isolates detector errors from OCR recognition.
    assert detect_secrets(oracle(case, boxes), DetectionConfig(language="eng")) == []
    with TestClient(create_app()) as client:
        res = client.post(
            "/api/scan",
            files={"image": ("arbitrary-name.png", image, "image/png")},
            data={"config": DetectionConfig(language="eng").model_dump_json()},
        )
        assert res.status_code == 200
        assert res.json()["findings"] == []


def wait_for(check, timeout=12):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if check():
            return
        time.sleep(0.05)
    assert check(), "Timed out waiting for real folder/OCR event"


def test_clean_then_secret_agent_backend_acceptance(tmp_path, caplog):
    folder = tmp_path / "Screenshots"
    folder.mkdir()
    settings = AgentSettings(folder=str(folder), enabled=True)
    settings.config.language = "eng"
    settings_path = tmp_path / "consent.json"
    save_settings(settings_path, settings)

    class NotificationRecorder:
        last_status = "not_sent"

        def __init__(self):
            self.items = []

        def notify(self, count, key):
            self.items.append({"count": count, "id": key})
            self.last_status = "submitted"
            return True

        def clear(self):
            pass

    notifier = NotificationRecorder()
    agent = Companion("http://127.0.0.1:8044", path=settings_path, notifier=notifier)
    with TestClient(
        create_app(agent), base_url="http://127.0.0.1:8044", client=("127.0.0.1", 55000)
    ) as client:
        session = client.get(
            "/api/desktop/session",
            headers={"X-ScreenGuard-Client": "pwa", "Sec-Fetch-Site": "same-origin"},
        )
        headers = {"X-ScreenGuard-CSRF": session.json()["csrf"]}
        clean = next(c for c in CASES if c.id == "youtube_clean")
        (folder / "first.png").write_bytes(render(clean)[0])
        wait_for(lambda: agent.status()["scanned"] == 1)
        assert notifier.items == [] and agent.status()["pending_reviews"] == 0
        secret = Case(
            "acceptance",
            "TC10",
            (
                "PS C:\\Demo>",
                "DATABASE_PASSWORD=DemoPass123!",
                "Contact: privacy.test@example.com",
            ),
            ((1, "DB_CREDENTIAL"), (2, "EMAIL")),
            style="terminal",
        )
        payload = render(secret)[0]
        (folder / "second.png").write_bytes(payload)
        wait_for(lambda: len(notifier.items) == 1)
        assert notifier.items[0]["count"] == 2
        key = notifier.items[0]["id"]
        review = client.get(f"/api/desktop/reviews/{key}", headers=headers)
        data = review.json()
        result = data["result"]
        import base64

        original = base64.b64decode(data["image"])
        with Image.open(BytesIO(original)) as shown, Image.open(
            BytesIO(payload)
        ) as authored:
            assert (
                shown.size == authored.size
                and shown.convert("RGB").tobytes() == authored.convert("RGB").tobytes()
            )
        assert {f["type"] for f in result["findings"]} == {"DB_CREDENTIAL", "EMAIL"}
        ticket = result["scan_ticket"]
        assert (
            client.post("/api/policy/evaluate", json={"ticket": ticket}).json()[
                "decision"
            ]
            == "BLOCK"
        )
        blocked = client.post("/api/export", json={"ticket": ticket})
        assert (
            blocked.status_code == 403
            and blocked.json()["detail"]["code"] == "POLICY_BLOCKED"
        )
        password = next(f for f in result["findings"] if f["type"] == "DB_CREDENTIAL")
        x, y, right, bottom = password["bbox"]
        boxes = [{"x": x, "y": y, "width": right - x, "height": bottom - y}]
        warn = client.post(
            "/api/policy/evaluate", json={"ticket": ticket, "redactions": boxes}
        )
        assert warn.json()["decision"] == "WARN"
        pending = client.post(
            "/api/export", json={"ticket": ticket, "redactions": boxes}
        )
        assert (
            pending.status_code == 400
            and pending.json()["detail"]["code"] == "CONFIRMATION_REQUIRED"
        )
        exported = client.post(
            "/api/export",
            json={
                "ticket": ticket,
                "redactions": boxes,
                "confirmed_warnings": warn.json()["reasons"],
            },
        )
        assert (
            exported.status_code == 200
            and exported.headers["content-type"] == "image/png"
        )
        assert (
            hashlib.sha256(exported.content).hexdigest()
            == exported.headers["X-Image-Hash"]
        )
        with Image.open(BytesIO(exported.content)) as image, Image.open(
            BytesIO(original)
        ) as source:
            assert image.size == source.size
            assert image.crop((x, y, right, bottom)).getextrema() == tuple(
                (v, v) for v in (17, 24, 39, 255)
            )
            assert image.getpixel((5, 5)) == source.convert("RGBA").getpixel((5, 5))
            assert not image.getexif()
        for finding in result["findings"]:
            x, y, right, bottom = finding["bbox"]
            boxes.append({"x": x, "y": y, "width": right - x, "height": bottom - y})
        assert (
            client.post(
                "/api/policy/evaluate", json={"ticket": ticket, "redactions": boxes}
            ).json()["decision"]
            == "ALLOW"
        )
        assert "DemoPass123!" not in json.dumps(
            notifier.items
        ) + caplog.text + json.dumps(result)


def test_quoted_or_equals_letter_only_values_remain_detectable():
    for line in [
        "DATABASE_PASSWORD=Supersecret",
        "API_KEY=authentication",
        'API_KEY: "authentication"',
        "DATABASE_PASSWORD: DemoPass123!",
    ]:
        case = Case("value", "TC05", (line,))
        _, boxes = render(case)
        assert detect_secrets(oracle(case, boxes), DetectionConfig())


@pytest.mark.parametrize(
    "case",
    [
        (
            pytest.param(
                c,
                marks=pytest.mark.xfail(
                    reason="Known baseline OCR miss: Consolas zero glyphs read as letters; detector oracle succeeds",
                    strict=False,
                ),
            )
            if c.id in {"citizen", "pii_mixed"}
            else c
        )
        for c in CASES
        if not c.stress
    ],
    ids=lambda c: c.id,
)
def test_ground_truth_clear_corpus_through_real_pipeline(case):
    from core.pipeline import run_pipeline

    image, boxes = render(case)
    result = run_pipeline(image, DetectionConfig(language="eng"), "image/png")
    counts = matched_counts(case.expected, result.findings, boxes)
    assert counts == {"tp": len(case.expected), "fp": 0, "fn": 0}


def test_public_youtube_screenshot_has_no_sensitive_patterns():
    from core.pipeline import run_pipeline

    image = Path("tests/qa/fixtures/youtube-public.png").read_bytes()
    assert (
        run_pipeline(image, DetectionConfig(language="eng"), "image/png").findings == []
    )


def test_windows_native_notification_contains_no_raw_password(tmp_path, caplog):
    import os

    if os.name != "nt" or os.environ.get("SCREENGUARD_QA_NATIVE") != "1":
        pytest.skip("Opt-in Windows toast smoke: SCREENGUARD_QA_NATIVE=1")
    from desktop_agent.notifications import WindowsNotifications
    from windows_toasts import WindowsToaster
    from windows_toasts.toasters import ToastNotificationManager

    app_id = "ScreenGuardPlus.PreDemoQA"

    class QANotifications(WindowsNotifications):
        def _prepare(self):
            # Isolate QA toasts from the running demo companion's notification history.
            self._toaster = WindowsToaster(app_id)

    folder = tmp_path / "Screenshots"
    folder.mkdir()
    settings = AgentSettings(folder=str(folder), enabled=True, popup_enabled=False)
    settings.config.language = "eng"
    path = tmp_path / "settings.json"
    save_settings(path, settings)
    notifier = QANotifications("http://127.0.0.1:8046")
    agent = Companion(notifier.base_url, path=path, notifier=notifier)
    try:
        agent.start()
        (folder / "native.png").write_bytes(
            render(next(c for c in CASES if c.id == "terminal_password"))[0]
        )
        wait_for(lambda: agent.status()["scanned"] == 1)
        assert notifier.last_status == "submitted"
        history = ToastNotificationManager.history.get_history_with_id(app_id)
        assert len(history) >= 1
        xml = history[0].content.get_xml()
        key = agent.reviews.notifications()[0]["id"]
        assert f"http://127.0.0.1:8046/#/scanner?review={key}" in xml
        assert "DemoPass123!" not in xml + caplog.text
    finally:
        agent.close()
