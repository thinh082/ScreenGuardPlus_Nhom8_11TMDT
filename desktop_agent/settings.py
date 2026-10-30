"""Only consent and detection preferences are persisted, never screenshot data."""
import os
from pathlib import Path

from pydantic import Field

from core.models import ContractModel, DetectionConfig
from core.rules import validate_rules


class AgentSettings(ContractModel):
    folder: str | None = None
    enabled: bool = False
    popup_enabled: bool = True
    config: DetectionConfig = Field(default_factory=DetectionConfig)


def settings_path() -> Path:
    return Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share")) / "ScreenGuardPlus" / "companion.json"


def load_settings(path: Path) -> AgentSettings:
    try:
        if path.stat().st_size > 64 * 1024:
            return AgentSettings()
        value = AgentSettings.model_validate_json(path.read_bytes())
        validate_rules(value.config)
        return value
    except (OSError, ValueError):
        return AgentSettings()


def save_settings(path: Path, value: AgentSettings) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(value.model_dump_json(), encoding="utf-8")
    temporary.replace(path)


def allowed_folder(value: str) -> Path:
    """A single explicit directory, never a drive root, network share or junction."""
    candidate = Path(value).absolute()
    if str(candidate).startswith(("\\\\", "//")):
        raise ValueError("Hãy chọn thư mục trên ổ đĩa local.")
    for part in [candidate, *candidate.parents]:
        if part.is_symlink() or getattr(part, "is_junction", lambda: False)():
            raise ValueError("Không theo dõi thư mục liên kết hoặc junction.")
    resolved = candidate.resolve(strict=True)
    if os.name == "nt":
        import ctypes
        # Mapped network drives must not bypass the UNC restriction.
        if ctypes.windll.kernel32.GetDriveTypeW(str(resolved.anchor)) not in {2, 3, 6}:
            raise ValueError("Hãy chọn ổ đĩa local, không dùng network drive.")
    if not resolved.is_dir() or resolved == Path(resolved.anchor) or resolved == Path.home().resolve():
        raise ValueError("Hãy chọn một thư mục Screenshots cụ thể.")
    return resolved


def choose_folder() -> str | None:
    # Native dialog is the consent boundary: websites cannot submit arbitrary paths.
    from tkinter import Tk, filedialog
    root = Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        value = filedialog.askdirectory(parent=root, title="ScreenGuard+ — Cho phép theo dõi thư mục Screenshots", mustexist=True)
        return str(allowed_folder(value)) if value else None
    finally:
        root.destroy()
