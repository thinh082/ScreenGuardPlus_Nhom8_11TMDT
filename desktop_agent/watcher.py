"""Non-recursive Watchdog monitoring with bounded debounce, retry and deduplication."""
from collections import OrderedDict
import ctypes
import hashlib
from io import BytesIO
import os
from pathlib import Path
import threading
import time

from PIL import Image, ImageOps
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from core.pipeline import run_pipeline
from core.validator import MAX_BYTES, ImageValidationError, validate_image
from desktop_agent.settings import allowed_folder

EXTENSIONS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


def read_local_file(path: Path, root: Path) -> bytes:
    """Read a bounded regular file, rejecting links and Windows writers still using it."""
    if allowed_folder(str(root)) != root or path.is_symlink() or path.resolve(strict=True).parent != root:
        raise ImageValidationError("File is outside the approved folder")
    before = path.stat()
    if not 0 < before.st_size <= MAX_BYTES:
        raise ImageValidationError("Invalid image size")
    if os.name == "nt":
        from ctypes import wintypes
        import msvcrt
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        create = kernel.CreateFileW
        create.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
        create.restype = wintypes.HANDLE
        # FILE_SHARE_READ only: a handle that is still writing makes this fail.
        handle = create(str(path), 0x80000000, 1, None, 3, 0x00200000, None)
        if handle == ctypes.c_void_p(-1).value:
            raise OSError("Image is still being written")
        close = kernel.CloseHandle
        close.argtypes = [wintypes.HANDLE]
        try:
            get_name = kernel.GetFinalPathNameByHandleW
            get_name.argtypes = [wintypes.HANDLE, wintypes.LPWSTR, wintypes.DWORD, wintypes.DWORD]
            get_name.restype = wintypes.DWORD
            buffer = ctypes.create_unicode_buffer(32768)
            length = get_name(handle, buffer, len(buffer), 0)
            if not length or length >= len(buffer):
                raise OSError("Cannot verify image location")
            final = buffer.value.removeprefix("\\\\?\\")
            if Path(final).parent != root:
                raise ImageValidationError("File handle is outside the approved folder")
            descriptor = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
            handle = None  # The descriptor owns it now.
            source = os.fdopen(descriptor, "rb")
        finally:
            if handle is not None:
                close(handle)
    else:
        source = os.fdopen(os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)), "rb")
    with source:
        payload = source.read(MAX_BYTES + 1)
        after = os.fstat(source.fileno())
    if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino) or len(payload) != after.st_size:
        raise OSError("Image changed while reading")
    validate_image(payload, EXTENSIONS[path.suffix.lower()])
    return payload


def review_image(payload: bytes) -> bytes:
    # Strip metadata and match the orientation/white alpha background used by core OCR.
    with Image.open(BytesIO(payload)) as source:
        rgba = ImageOps.exif_transpose(source).convert("RGBA")
        rgb = Image.new("RGB", rgba.size, "white")
        rgb.paste(rgba, mask=rgba.getchannel("A"))
        output = BytesIO()
        rgb.save(output, format="PNG")
    normalized = output.getvalue()
    validate_image(normalized, "image/png")
    return normalized


class ScreenshotWatcher(FileSystemEventHandler):
    def __init__(self, folder, get_config, on_result, on_error, *, settle=.8, retry_seconds=15, scan=run_pipeline):
        self.root = allowed_folder(str(folder))
        self.get_config, self.on_result, self.on_error = get_config, on_result, on_error
        self.settle, self.retry_seconds, self.scan = settle, retry_seconds, scan
        self.observer = Observer()
        self._condition = threading.Condition()
        self._pending = OrderedDict()
        self._known = OrderedDict()
        self._seen = OrderedDict()
        self.stopped = threading.Event()
        self.worker = threading.Thread(target=self._work, daemon=True, name="screenguard-ocr")
        self.scanned = self.duplicates = self.rejected = self.dropped = 0

    @property
    def running(self):
        return not self.stopped.is_set() and self.observer.is_alive() and self.worker.is_alive() and all(e.is_alive() for e in self.observer.emitters)

    def start(self):
        # No enumeration or scan of old images. Only events after this consent point.
        self.observer.schedule(self, str(self.root), recursive=False)
        self.observer.start()
        self.worker.start()

    def stop(self):
        self.stopped.set()
        self.observer.stop()
        with self._condition:
            self._pending.clear()
            self._condition.notify_all()
        if self.observer.is_alive():
            self.observer.join(timeout=2)
        if self.worker.is_alive():
            self.worker.join(timeout=.2)
        # An already running Tesseract call cannot publish after stop; core timeout applies.

    def on_created(self, event):
        if not event.is_directory:
            self.enqueue(event.src_path)

    def on_moved(self, event):
        if not event.is_directory:
            self.enqueue(event.dest_path)

    def on_modified(self, event):
        if not event.is_directory:
            self.enqueue(event.src_path, new=False)

    def enqueue(self, filename, new=True):
        path = Path(filename).absolute()
        if self.stopped.is_set() or path.suffix.lower() not in EXTENSIONS or path.parent != self.root:
            return
        with self._condition:
            if not new and path not in self._known:
                return
            now = time.monotonic()
            self._known[path] = now
            while len(self._known) > 512:
                self._known.popitem(last=False)
            first = self._pending.get(path, (now, now))[0]
            if path not in self._pending and len(self._pending) >= 64:
                self.dropped += 1
                return
            self._pending[path] = (first, now + self.settle)
            self._condition.notify()

    def _retry(self, path, first):
        if time.monotonic() - first >= self.retry_seconds:
            self.rejected += 1
            self.on_error("invalid_image")
        elif not self.stopped.is_set():
            with self._condition:
                self._pending.setdefault(path, (first, time.monotonic() + self.settle))

    def _work(self):
        while not self.stopped.is_set():
            with self._condition:
                if not self._pending:
                    self._condition.wait(.25)
                    continue
                path, (first, due) = min(self._pending.items(), key=lambda pair: pair[1][1])
                if due > time.monotonic():
                    self._condition.wait(min(.25, due - time.monotonic()))
                    continue
                del self._pending[path]
            self._process(path, first)

    def _process(self, path, first):
        # Separate frame: never retain the last image while the worker waits idle.
        try:
            payload = read_local_file(path, self.root)
        except (OSError, ValueError):
            self._retry(path, first)
            return
        digest = hashlib.sha256(payload).digest()
        if digest in self._seen:
            self.duplicates += 1
            return
        try:
            image = review_image(payload)
            if self.stopped.is_set():
                return
            result = self.scan(image, self.get_config(), "image/png")
            if self.stopped.is_set():
                return
            self._seen[digest] = True
            while len(self._seen) > 512:
                self._seen.popitem(last=False)
            self.scanned += 1
            self.on_result(image, result)
        except Exception:
            # Never log filenames, bytes, OCR text, custom rules or exceptions.
            self.on_error("scan_failed")
