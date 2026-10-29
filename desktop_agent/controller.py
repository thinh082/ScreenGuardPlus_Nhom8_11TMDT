"""Companion lifecycle shared with the existing local FastAPI application."""
from pathlib import Path
import threading

from core.models import DetectionConfig
from core.rules import validate_rules
from desktop_agent.notifications import WindowsNotifications
from desktop_agent.reviews import ReviewStore
from desktop_agent.settings import allowed_folder, choose_folder, load_settings, save_settings, settings_path


class Companion:
    def __init__(self, base_url, *, path=None, notifier=None, picker=choose_folder):
        self.path = Path(path) if path else settings_path()
        self.settings = load_settings(self.path)
        self.notifications = notifier or WindowsNotifications(base_url)
        self.picker = picker
        self.reviews = ReviewStore()
        self.watcher = None
        self.last_error = None
        self._lock = threading.RLock()
        self._picker_lock = threading.Lock()
        self._closed = threading.Event()
        self._epoch = 0
        self._janitor = None

    def start(self):
        if self._janitor is not None:
            return
        self._janitor = threading.Thread(target=self._expire, daemon=True, name="screenguard-expiry")
        self._janitor.start()
        if self.settings.enabled:
            try:
                self.enable(True)
            except (ValueError, OSError, ImportError):
                self.last_error = "start_failed"
                self.settings.enabled = False

    def _expire(self):
        while not self._closed.wait(1):
            self.reviews.count()

    def status(self):
        with self._lock:
            running = bool(self.watcher and self.watcher.running)
            return {
                "available": not self._closed.is_set(), "running": running,
                "state": "Running" if running else "Stopped",
                "enabled": self.settings.enabled, "folder": self.settings.folder,
                "error": self.last_error, "notification": self.notifications.last_status,
                "pending_reviews": self.reviews.count(),
                "scanned": self.watcher.scanned if self.watcher else 0,
                "duplicates": self.watcher.duplicates if self.watcher else 0,
                "rejected": self.watcher.rejected if self.watcher else 0,
                "dropped": self.watcher.dropped if self.watcher else 0,
            }

    def _save(self):
        save_settings(self.path, self.settings)

    def select_folder(self):
        if not self._picker_lock.acquire(blocking=False):
            raise ValueError("Hộp chọn thư mục đang mở trên Windows.")
        try:
            value = self.picker()
            if value:
                folder = allowed_folder(value)
                with self._lock:
                    self.enable(False)
                    self.settings.folder = str(folder)
                    self._save()
            return self.status()
        finally:
            self._picker_lock.release()

    def configure(self, config: DetectionConfig):
        validate_rules(config)
        with self._lock:
            self.settings.config = config.model_copy(deep=True)
            self._save()

    def enable(self, enabled: bool):
        with self._lock:
            if self._closed.is_set():
                raise ValueError("Agent đã đóng.")
            if enabled and self.watcher and self.watcher.running:
                return self.status()
            self._epoch += 1
            epoch = self._epoch
            old, self.watcher = self.watcher, None
            self.settings.enabled = False
            if old:
                old.stop()
            self.reviews.clear()
            self.notifications.clear()
            self.last_error = None
            if enabled:
                if not self.settings.folder:
                    raise ValueError("Hãy chọn thư mục cho phép trước khi bật.")
                from desktop_agent.watcher import ScreenshotWatcher
                folder = allowed_folder(self.settings.folder)

                def result(image, findings):
                    with self._lock:
                        if epoch != self._epoch or not self.settings.enabled or self._closed.is_set():
                            return
                        self.last_error = None
                        if findings.findings:
                            key = self.reviews.put(image, findings)
                            self.notifications.notify(len(findings.findings), key)

                def error(code):
                    with self._lock:
                        if epoch == self._epoch:
                            self.last_error = code

                self.watcher = ScreenshotWatcher(folder, lambda: self.settings.config.model_copy(deep=True), result, error)
                try:
                    self.watcher.start()
                    self.settings.enabled = True
                except Exception:
                    self.watcher.stop()
                    self.watcher = None
                    self.last_error = "start_failed"
                    self._save()
                    raise ValueError("Không bật được thư mục đã chọn.") from None
            try:
                self._save()
            except OSError:
                # Consent must never run silently if it could not be persisted.
                self._epoch += 1
                self.settings.enabled = False
                if self.watcher:
                    self.watcher.stop()
                    self.watcher = None
                self.reviews.clear()
                raise
            return self.status()

    def close(self):
        # Preserve the user's preference, but do not start a task at Windows login.
        with self._lock:
            self._closed.set()
            self._epoch += 1
            if self.watcher:
                self.watcher.stop()
            self.reviews.clear()
            self.notifications.clear()
        if self._janitor:
            self._janitor.join(timeout=2)
