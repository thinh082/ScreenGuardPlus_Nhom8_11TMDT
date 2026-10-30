"""ScreenGuard+ Windows Launcher & Process Supervisor.

Starts backend + Windows screenshot companion on 127.0.0.1, verifies port availability,
monitors server health, auto-opens browser, and provides clean teardown.
"""
import argparse
import multiprocessing
import os
from pathlib import Path
import signal
import socket
import sys
import threading
import time
import urllib.request
import json
import webbrowser

# Freeze support must be called immediately for Windows multiprocessing
if __name__ == "__main__":
    multiprocessing.freeze_support()

# Configure stdout / stderr for UTF-8 on Windows
if sys.stdout is not None and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr is not None and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from core.resources import get_base_path, get_frontend_dir, get_icon_path
from core.ocr import get_ocr_status


def is_port_in_use(host: str, port: int) -> bool:
    """Test if a local TCP port is already open."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def probe_screenguard(host: str, port: int) -> bool:
    """Check if the service on host:port is an existing ScreenGuard+ instance."""
    try:
        url = f"http://{host}:{port}/api/health"
        req = urllib.request.Request(url, headers={"User-Agent": "ScreenGuardPlus-Launcher"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                return "tesseract_installed" in data
    except Exception:
        pass
    return False


def wait_for_health(host: str, port: int, timeout: float = 15.0) -> bool:
    """Poll /api/health until server is responsive or timeout expires."""
    deadline = time.time() + timeout
    url = f"http://{host}:{port}/api/health"
    while time.time() < deadline:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ScreenGuardPlus-Launcher"})
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.15)
    return False


def show_error_dialog(title: str, message: str):
    """Show native error dialog without requiring terminal."""
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        messagebox.showerror(title, message, parent=root)
        root.destroy()
    except Exception:
        sys.stderr.write(f"[{title}] {message}\n")


def show_info_dialog(title: str, message: str):
    """Show native informational dialog."""
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        messagebox.showinfo(title, message, parent=root)
        root.destroy()
    except Exception:
        print(f"[{title}] {message}")


class ScreenGuardSupervisor:
    """Manages FastAPI server and Desktop Companion lifecycle."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8000, auto_browser: bool = True):
        self.host = host
        self.port = port
        self.auto_browser = auto_browser
        self.base_url = f"http://{host}:{port}"
        self.server = None
        self.server_thread = None
        self.agent = None
        self.ocr_status = get_ocr_status()
        self._stopped = threading.Event()

    def start(self) -> bool:
        """Initialize Companion and Uvicorn server in supervisor thread."""
        from desktop_agent.controller import Companion
        from backend.main import create_app
        import uvicorn

        # Companion agent preserves user consent saved in %LOCALAPPDATA%\ScreenGuardPlus\companion.json
        self.agent = Companion(self.base_url)

        # Create FastAPI application with desktop agent attached
        app = create_app(desktop_agent=self.agent)

        config = uvicorn.Config(
            app,
            host=self.host,
            port=self.port,
            log_level="warning",
            access_log=False,
            proxy_headers=False,
            workers=1,
        )
        self.server = uvicorn.Server(config)
        self.server_thread = threading.Thread(target=self.server.run, daemon=True, name="ScreenGuard-Server")
        self.server_thread.start()

        # Wait for health check confirmation
        ready = wait_for_health(self.host, self.port, timeout=15.0)
        if not ready:
            self.stop()
            return False

        if self.auto_browser:
            webbrowser.open(self.base_url)

        return True

    def stop(self):
        """Clean teardown of server, agent watcher, popups, and threads."""
        if self._stopped.is_set():
            return
        self._stopped.set()

        if self.server:
            self.server.should_exit = True

        if self.agent:
            try:
                self.agent.close()
            except Exception:
                pass

        if self.server_thread and self.server_thread.is_alive():
            self.server_thread.join(timeout=3.0)


def run_gui(supervisor: ScreenGuardSupervisor):
    """Launch native Tkinter supervisor window with status controls."""
    import tkinter as tk
    from tkinter import messagebox

    root = tk.Tk()
    root.title("ScreenGuard+ — Trình quản lý ứng dụng")
    root.geometry("480x320")
    root.resizable(False, False)
    root.configure(bg="#0f172a")

    # Set icon if available
    icon_path = get_icon_path("app.ico")
    if icon_path.is_file():
        try:
            root.iconbitmap(str(icon_path))
        except Exception:
            pass

    # Center on screen
    root.update_idletasks()
    x = (root.winfo_screenwidth() - 480) // 2
    y = (root.winfo_screenheight() - 320) // 2
    root.geometry(f"+{x}+{y}")

    main_frame = tk.Frame(root, bg="#0f172a", padx=24, pady=20)
    main_frame.pack(fill="both", expand=True)

    # Header
    title_label = tk.Label(
        main_frame,
        text="ScreenGuard+",
        font=("Segoe UI", 16, "bold"),
        fg="#38bdf8",
        bg="#0f172a",
    )
    title_label.pack(anchor="w")

    subtitle = tk.Label(
        main_frame,
        text="Privacy & Security Data Loss Prevention (DLP)",
        font=("Segoe UI", 9),
        fg="#94a3b8",
        bg="#0f172a",
    )
    subtitle.pack(anchor="w", pady=(0, 14))

    # Status box
    status_card = tk.Frame(main_frame, bg="#1e293b", padx=14, pady=12, relief="flat", highlightthickness=1, highlightbackground="#334155")
    status_card.pack(fill="x", pady=(0, 14))

    server_status = tk.Label(
        status_card,
        text=f"● Máy chủ đang chạy: {supervisor.base_url}",
        font=("Segoe UI", 10, "bold"),
        fg="#22c55e",
        bg="#1e293b",
    )
    server_status.pack(anchor="w")

    ocr_text = "● Tesseract OCR: " + (
        f"Sẵn sàng ({', '.join(supervisor.ocr_status.get('languages', []))})"
        if supervisor.ocr_status.get("ocr_available")
        else "Chưa cấu hình (tính năng tự động tạm tắt)"
    )
    ocr_fg = "#22c55e" if supervisor.ocr_status.get("ocr_available") else "#f59e0b"
    ocr_label = tk.Label(status_card, text=ocr_text, font=("Segoe UI", 9), fg=ocr_fg, bg="#1e293b")
    ocr_label.pack(anchor="w", pady=(4, 0))

    agent_enabled = getattr(supervisor.agent.settings, "enabled", False) if supervisor.agent else False
    agent_text = "● Giám sát Screenshot: " + ("Đang bật" if agent_enabled else "Tắt (cần cấp quyền trong Cài đặt)")
    agent_fg = "#38bdf8" if agent_enabled else "#94a3b8"
    agent_label = tk.Label(status_card, text=agent_text, font=("Segoe UI", 9), fg=agent_fg, bg="#1e293b")
    agent_label.pack(anchor="w", pady=(2, 0))

    # Button actions
    def open_web():
        webbrowser.open(supervisor.base_url)

    def open_config_folder():
        config_dir = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".local/share")) / "ScreenGuardPlus"
        config_dir.mkdir(parents=True, exist_ok=True)
        os.startfile(str(config_dir))

    def on_exit():
        supervisor.stop()
        root.destroy()

    btn_frame = tk.Frame(main_frame, bg="#0f172a")
    btn_frame.pack(fill="x", pady=(6, 0))

    btn_open = tk.Button(
        btn_frame,
        text="Mở giao diện Web",
        command=open_web,
        bg="#0284c7",
        fg="#ffffff",
        activebackground="#0369a1",
        activeforeground="#ffffff",
        font=("Segoe UI", 9, "bold"),
        relief="flat",
        padx=12,
        pady=6,
        cursor="hand2",
    )
    btn_open.pack(side="left", padx=(0, 8))

    btn_config = tk.Button(
        btn_frame,
        text="Thư mục cấu hình",
        command=open_config_folder,
        bg="#334155",
        fg="#f1f5f9",
        activebackground="#475569",
        activeforeground="#ffffff",
        font=("Segoe UI", 9),
        relief="flat",
        padx=10,
        pady=6,
        cursor="hand2",
    )
    btn_config.pack(side="left")

    btn_stop = tk.Button(
        btn_frame,
        text="Dừng & Thoát",
        command=on_exit,
        bg="#dc2626",
        fg="#ffffff",
        activebackground="#b91c1c",
        activeforeground="#ffffff",
        font=("Segoe UI", 9, "bold"),
        relief="flat",
        padx=12,
        pady=6,
        cursor="hand2",
    )
    btn_stop.pack(side="right")

    root.protocol("WM_DELETE_WINDOW", on_exit)
    root.mainloop()


def run_cli(supervisor: ScreenGuardSupervisor):
    """Run in console/headless mode, responding to interrupt signals."""
    print(f"[ScreenGuard+] Service running at: {supervisor.base_url}")
    print(f"[ScreenGuard+] Press Ctrl+C to terminate application cleanly.")
    try:
        while not supervisor._stopped.is_set():
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[ScreenGuard+] Shutting down server and processes...")
    finally:
        supervisor.stop()
        print("[ScreenGuard+] Stopped cleanly.")


def main():
    parser = argparse.ArgumentParser(
        description="ScreenGuard+ Windows Launcher — DLP Protection for Screenshots",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--port", type=int, default=8000, help="Local TCP port (127.0.0.1)")
    parser.add_argument("--host", default="127.0.0.1", help="Loopback bind address only")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically launch web browser")
    parser.add_argument("--cli", action="store_true", help="Run in terminal CLI mode without GUI supervisor window")
    parser.add_argument("--headless", action="store_true", help="Alias for --cli --no-browser")
    args = parser.parse_args()

    # Enforce loopback bind
    if args.host not in ("127.0.0.1", "localhost"):
        show_error_dialog(
            "ScreenGuard+ — Lỗi Bảo Mật",
            "ScreenGuard+ chỉ được phép bind trên loopback (127.0.0.1) để bảo vệ dữ liệu nhạy cảm.",
        )
        sys.exit(1)

    # Check port conflicts
    if is_port_in_use(args.host, args.port):
        if probe_screenguard(args.host, args.port):
            # Already running instance
            if not (args.no_browser or args.headless):
                webbrowser.open(f"http://{args.host}:{args.port}")
            show_info_dialog(
                "ScreenGuard+ Đang Chạy",
                f"ScreenGuard+ đã đang chạy tại http://{args.host}:{args.port}.\nĐã mở giao diện trong trình duyệt.",
            )
            sys.exit(0)
        else:
            show_error_dialog(
                "ScreenGuard+ — Cổng Bị Chiếm",
                f"Cổng {args.port} trên máy của bạn đang bị chiếm bởi một ứng dụng khác.\n"
                f"Vui lòng tắt ứng dụng đó hoặc khởi động lại với tham số --port <cổng_khác>.",
            )
            sys.exit(1)

    # Initialize supervisor
    auto_browser = not (args.no_browser or args.headless)
    supervisor = ScreenGuardSupervisor(host=args.host, port=args.port, auto_browser=auto_browser)

    started = supervisor.start()
    if not started:
        show_error_dialog(
            "ScreenGuard+ — Lỗi Khởi Động",
            "Không thể khởi động dịch vụ ScreenGuard+ sau 15 giây. Vui lòng kiểm tra lại quyền hoặc log hệ thống.",
        )
        sys.exit(1)

    # Run appropriate supervisor interface
    if args.cli or args.headless:
        run_cli(supervisor)
    else:
        run_gui(supervisor)


if __name__ == "__main__":
    main()

