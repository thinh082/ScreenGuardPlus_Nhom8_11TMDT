"""Real OS Watchdog events and real Tesseract; native delivery tested separately."""
from io import BytesIO
import json
import shutil
import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from backend.main import create_app
from core.models import DetectionConfig
from core.ocr import get_ocr_status
from desktop_agent.controller import Companion
from desktop_agent.reviews import ReviewStore
from desktop_agent.settings import AgentSettings, allowed_folder, load_settings, save_settings
from desktop_agent.watcher import ScreenshotWatcher, read_local_file


def until(check, timeout=12):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if check():
            return
        time.sleep(.05)
    assert check(), "Timed out waiting for local companion event"


class Notifications:
    def __init__(self):
        self.items = []
        self.last_status = "not_sent"

    def notify(self, count, key):
        self.items.append((count, key))
        self.last_status = "submitted"
        return True

    def clear(self):
        pass


@pytest.fixture
def agent(tmp_path):
    if not get_ocr_status()["ocr_available"]:
        pytest.skip("Real Tesseract unavailable")
    folder = tmp_path / "Screenshots"
    folder.mkdir()
    value = Companion("http://127.0.0.1:8014", path=tmp_path / "settings.json", notifier=Notifications(), picker=lambda: str(folder))
    value.settings.folder = str(folder)
    value.configure(DetectionConfig(language="eng"))
    value.start()
    yield value
    value.close()


def test_real_folder_monitor_without_browser_email_multi_clean_dedup_stop(agent):
    folder = Path(agent.settings.folder)
    # Existing screenshots must not be scanned on enable.
    shutil.copyfile("sample_data/screenshots/email.png", folder / "old.png")
    agent.enable(True)
    assert agent.status()["state"] == "Running"
    shutil.copyfile("sample_data/screenshots/email.png", folder / "new.PNG")
    until(lambda: len(agent.notifications.items) == 1)
    count, key = agent.notifications.items[0]
    assert count == 1
    review = agent.reviews.get(key)
    assert review.result.mode == "real_ocr"
    assert review.result.findings[0].type == "EMAIL"
    assert "test.screenguard@example.com" not in review.result.model_dump_json()
    shutil.copyfile("sample_data/screenshots/email.png", folder / "duplicate.png")
    until(lambda: agent.watcher.duplicates >= 1)
    assert len(agent.notifications.items) == 1
    shutil.copyfile("sample_data/screenshots/all.png", folder / "multi.png")
    until(lambda: len(agent.notifications.items) == 2)
    assert agent.notifications.items[1][0] == 5
    shutil.copyfile("sample_data/screenshots/clean.png", folder / "clean.png")
    until(lambda: agent.watcher.scanned == 3)
    assert len(agent.notifications.items) == 2
    watcher = agent.watcher
    agent.enable(False)
    assert agent.status()["state"] == "Stopped"
    assert agent.reviews.count() == 0
    shutil.copyfile("sample_data/screenshots/phone.png", folder / "after-stop.png")
    assert watcher.stopped.wait(.1)
    time.sleep(1)
    assert watcher.scanned == 3 and len(agent.notifications.items) == 2


def test_partial_corrupt_atomic_rename_and_no_recursive_watch(agent):
    agent.enable(True)
    agent.watcher.settle = .15
    agent.watcher.retry_seconds = 1.5
    folder = Path(agent.settings.folder)
    payload = Path("sample_data/screenshots/email.png").read_bytes()
    partial = folder / "partial.png"
    # A writer stays open past debounce. Windows share mode must prevent early reads.
    with partial.open("wb") as stream:
        stream.write(payload[:40])
        stream.flush()
        time.sleep(.35)
        assert not agent.notifications.items
        stream.write(payload[40:])
    until(lambda: len(agent.notifications.items) == 1)
    (folder / "corrupt.png").write_bytes(b"not PNG")
    until(lambda: agent.watcher.rejected >= 1)
    assert len(agent.notifications.items) == 1
    nested = folder / "nested"
    nested.mkdir()
    shutil.copyfile("sample_data/screenshots/all.png", nested / "not-allowed.png")
    staging = folder / "save.tmp"
    shutil.copyfile("sample_data/screenshots/all.png", staging)
    staging.rename(folder / "atomic.jpg")  # Signature mismatch is rejected.
    until(lambda: agent.watcher.rejected >= 2)
    shutil.copyfile("sample_data/screenshots/all.png", folder / "next.tmp")
    (folder / "next.tmp").rename(folder / "atomic.png")
    until(lambda: len(agent.notifications.items) == 2)
    assert agent.notifications.items[-1][0] == 5


def test_disable_during_ocr_never_publishes_late_result(agent):
    agent.enable(True)
    entered, release = threading.Event(), threading.Event()
    pipeline = agent.watcher.scan

    def delayed(*args):
        entered.set()
        release.wait(10)
        return pipeline(*args)

    old = agent.watcher
    old.scan = delayed
    shutil.copyfile("sample_data/screenshots/email.png", Path(agent.settings.folder) / "pending.png")
    assert entered.wait(5)
    agent.enable(False)
    release.set()
    old.worker.join(timeout=10)
    assert not old.worker.is_alive()
    assert agent.reviews.count() == 0 and not agent.notifications.items


def test_dead_watcher_is_not_reported_running_and_can_restart(agent):
    agent.enable(True)
    agent.watcher.observer.stop()
    agent.watcher.observer.join(timeout=2)
    assert agent.status()["state"] == "Stopped"
    assert agent.status()["error"] == "watcher_stopped"
    agent.enable(True)
    assert agent.status()["running"] is True
    shutil.copyfile("sample_data/screenshots/email.png", Path(agent.settings.folder) / "after-restart.png")
    until(lambda: agent.status()["scanned"] == 1)
    assert agent.status()["error"] is None


def test_scan_error_has_safe_diagnostics_and_next_file_can_recover(agent):
    agent.enable(True)
    pipeline = agent.watcher.scan
    def failing(*args):
        raise RuntimeError("Fictitious private OCR data must never reach diagnostics")
    agent.watcher.scan = failing
    shutil.copyfile("sample_data/screenshots/email.png", Path(agent.settings.folder) / "fails.png")
    until(lambda: agent.status()["error"] == "scan_failed")
    assert agent.notifications.items == []
    assert "private OCR" not in json.dumps(agent.status())
    agent.watcher.scan = pipeline
    shutil.copyfile("sample_data/screenshots/email.png", Path(agent.settings.folder) / "recovers.png")
    until(lambda: len(agent.notifications.items) == 1)
    assert agent.status()["running"] is True and agent.status()["error"] is None


def test_notification_failure_keeps_review_available(agent):
    def fail(count, key):
        agent.notifications.last_status = "failed"
        return False
    agent.notifications.notify = fail
    agent.enable(True)
    shutil.copyfile("sample_data/screenshots/email.png", Path(agent.settings.folder) / "notification-failure.png")
    until(lambda: agent.status()["notification"] == "failed")
    assert agent.status()["pending_reviews"] == 1
    assert agent.status()["running"] is True


def test_jpeg_exif_review_matches_ocr_geometry_and_strips_metadata(agent):
    agent.enable(True)
    with Image.open("sample_data/screenshots/all.png") as source:
        stored = source.rotate(90, expand=True)
        exif = stored.getexif()
        exif[274] = 6
        stored.save(Path(agent.settings.folder) / "rotated.jpeg", quality=95, exif=exif)
        expected = source.size
    until(lambda: bool(agent.notifications.items))
    count, key = agent.notifications.items[0]
    assert count == 5
    item = agent.reviews.get(key)
    with Image.open(BytesIO(item.image)) as preview:
        assert preview.size == expected == (item.result.width, item.result.height)
        assert not preview.getexif()
    assert all(0 <= f.bbox[0] < f.bbox[2] <= expected[0] and 0 <= f.bbox[1] < f.bbox[3] <= expected[1] for f in item.result.findings)


def test_review_store_expires_and_evicts_bytes_without_disk(agent):
    now = [0.0]
    store = ReviewStore(ttl=10, max_items=2, max_bytes=6, clock=lambda: now[0])
    # Storage mechanics only; no OCR assertion here.
    a = store.put(b"123", None)
    b = store.put(b"456", None)
    c = store.put(b"789", None)
    assert store.get(a) is None and store.get(b) and store.get(c)
    now[0] = 10
    assert store.count() == 0 and store.get(c) is None
    with pytest.raises(ValueError):
        store.put(b"1234567", None)


def test_only_approved_regular_files_and_size_are_read(tmp_path):
    folder = tmp_path / "allowed"
    folder.mkdir()
    source = tmp_path / "outside.png"
    Image.new("RGB", (10, 10)).save(source)
    with pytest.raises(ValueError):
        read_local_file(source, folder)
    with pytest.raises(ValueError):
        allowed_folder(str(Path(folder.anchor)))
    try:
        (folder / "link.png").symlink_to(source)
    except OSError:
        pass  # Developer mode/admin is needed to create Windows symlinks.
    else:
        with pytest.raises(ValueError):
            read_local_file(folder / "link.png", folder)
    with (folder / "huge.png").open("wb") as stream:
        stream.truncate(10 * 1024 * 1024 + 1)
    with pytest.raises(ValueError):
        read_local_file(folder / "huge.png", folder)


def test_agent_config_and_consent_persist_without_image_history(tmp_path):
    path = tmp_path / "agent.json"
    value = AgentSettings(folder=str(tmp_path), enabled=True)
    value.config.types.email = False
    save_settings(path, value)
    saved = load_settings(path)
    assert saved.enabled and not saved.config.types.email
    assert set(json.loads(path.read_text())) == {"folder", "enabled", "config", "popup_enabled"}
    path.write_text("invalid JSON")
    assert not load_settings(path).enabled


def connect(client):
    response = client.get("/api/desktop/session", headers={"X-ScreenGuard-Client": "pwa", "Sec-Fetch-Site": "same-origin"})
    assert response.status_code == 200
    return {"X-ScreenGuard-CSRF": response.json()["csrf"]}


def test_private_endpoints_require_local_host_same_origin_cookie_and_csrf(agent):
    with TestClient(create_app(agent), base_url="http://127.0.0.1:8014", client=("127.0.0.1", 55000)) as client:
        assert client.get("/api/desktop/status").status_code == 403
        assert client.get("/api/desktop/session").status_code == 403
        headers = connect(client)
        assert client.get("/api/desktop/status", headers=[(b"X-ScreenGuard-CSRF", b"\xff")]).status_code == 403
        for bad in [{"Origin": "https://evil.example"}, {"Origin": "null"}, {"Sec-Fetch-Site": "cross-site"}, {"Host": "rebinding.example:8014"}]:
            assert client.get("/api/desktop/status", headers={**headers, **bad}).status_code == 403
        response = client.get("/api/desktop/status", headers=headers)
        assert response.json()["state"] == "Stopped"
        assert response.headers["cache-control"] == "no-store"
        assert client.post("/api/desktop/control", headers=headers, json={"enabled": True, "config": {}, "folder": "SENSITIVE_PATH"}).status_code == 422
        assert client.post("/api/desktop/folder", headers=headers).status_code == 200
        assert client.post("/api/desktop/control", headers=headers, json={"enabled": True, "config": DetectionConfig(language="eng").model_dump()}).json()["state"] == "Running"
        shutil.copyfile("sample_data/screenshots/email.png", Path(agent.settings.folder) / "new.png")
        until(lambda: bool(agent.notifications.items))
        key = agent.notifications.items[0][1]
        assert client.get('/api/desktop/notifications').status_code == 403
        notice=client.get('/api/desktop/notifications',headers=headers)
        assert notice.json()['items'][0]['count']==1
        assert 'image' not in notice.text and 'test.screenguard@example.com' not in notice.text
        assert notice.json()['last_scan']['findings']==1
        assert client.post('/api/desktop/popup',headers=headers,json={'enabled':False}).json()['popup_enabled'] is False
        assert load_settings(agent.path).popup_enabled is False
        assert client.get(f"/api/desktop/reviews/{key}").status_code == 403
        review = client.get(f"/api/desktop/reviews/{key}", headers=headers)
        assert review.status_code == 200 and review.json()["result"]["findings"][0]["type"] == "EMAIL"
        assert "test.screenguard@example.com" not in review.text
        assert client.delete(f"/api/desktop/reviews/{key}", headers=headers).status_code == 200
        assert client.get(f"/api/desktop/reviews/{key}", headers=headers).status_code == 410
        assert client.get('/api/desktop/notifications',headers=headers).json()['items']==[]
    with TestClient(create_app(), base_url="http://127.0.0.1", client=("192.0.2.20", 55000)) as remote:
        assert remote.get("/api/desktop/session", headers={"X-ScreenGuard-Client": "pwa", "Sec-Fetch-Site": "same-origin"}).status_code == 403


def test_plain_backend_never_claims_agent_is_running():
    with TestClient(create_app(), base_url="http://127.0.0.1", client=("127.0.0.1", 55000)) as client:
        headers = connect(client)
        assert client.get("/api/desktop/status", headers=headers).json()["running"] is False
        assert client.post("/api/desktop/folder", headers=headers).status_code == 503
