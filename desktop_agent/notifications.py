"""Native Windows toast; only count and opaque local review URL enter Windows."""
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
from desktop_agent.popup import DesktopPopup
from core.resources import get_icon_path


class WindowsNotifications:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.last_status = "not_sent"
        self._toaster = None
        self.popup = DesktopPopup(self.base_url)
        self.popup_enabled = True

    def set_popup(self, enabled):
        self.popup_enabled = bool(enabled)
        if enabled: self.popup.start()
        else: self.popup.clear()

    def popup_status(self):
        return self.popup.status()

    def discard(self, key):
        self.popup.discard(key)

    def close(self):
        self.clear()
        self.popup.close()

    def _prepare(self):
        if os.name != "nt":
            raise RuntimeError("Windows notifications require Windows")
        import winreg
        from windows_toasts import WindowsToaster
        app_id = "ScreenGuardPlus.Companion"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"Software\Classes\AppUserModelId\{app_id}") as key:
            winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, "ScreenGuard+")
            icon_path = get_icon_path("icon-192.png")
            winreg.SetValueEx(key, "IconUri", 0, winreg.REG_SZ, str(icon_path) if icon_path.is_file() else "")
        self._toaster = WindowsToaster(app_id)

    def notify(self, count: int, review_id: str) -> bool:
        # The persistent warning is independent of toast permissions / Do Not Disturb.
        if self.popup_enabled:
            self.popup.show(count, review_id)
        try:
            from windows_toasts import Toast
            if self._toaster is None:
                self._prepare()
            toast = Toast([
                "ScreenGuard+",
                f"Phát hiện {count} vùng có thể nhạy cảm trong screenshot.",
                "Mở để kiểm tra và chọn vùng cần che.",
            ])
            # Protocol activation works even with the browser/PWA closed.
            toast.launch_action = f"{self.base_url}/#/scanner?review={review_id}"
            toast.expiration_time = datetime.now(timezone.utc) + timedelta(minutes=10)
            toast.on_failed = lambda _: setattr(self, "last_status", "failed")
            self._toaster.show_toast(toast)
            # Delivery is requested, never claim the user saw a popup (DND may hide it).
            self.last_status = "submitted"
            return True
        except Exception:
            self.last_status = "failed"
            return False

    def clear(self):
        self.popup.clear()
        try:
            if self._toaster:
                self._toaster.clear_toasts()
        except Exception:
            pass
