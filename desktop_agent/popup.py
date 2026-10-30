"""Persistent, dismissible desktop warning. IPC contains counts/opaque IDs only."""
import multiprocessing
import os
import queue
import re
import threading
import time


def popup_main(commands, events, base_url):
    # Tk owns the main thread of its own process, never an OCR/API thread.
    try:
        import tkinter as tk
        import webbrowser
        def emit(kind, value):
            try: events.put_nowait((kind, value))
            except queue.Full:
                try: events.get_nowait(); events.put_nowait((kind, value))
                except (queue.Empty, queue.Full): pass
        root = tk.Tk()
        root.withdraw()
        root.title("ScreenGuard+ — Cảnh Báo Bảo Mật DLP")
        root.configure(bg="#0b0f19")
        root.resizable(False, False)
        root.attributes("-topmost", True)
        
        try:
            from core.resources import get_icon_path
            ico = get_icon_path("app.ico")
            if ico.is_file():
                root.iconbitmap(str(ico))
        except Exception:
            pass

        width, height = 540, 410
        root.geometry(f"{width}x{height}+{max(0,(root.winfo_screenwidth()-width)//2)}+{max(0,(root.winfo_screenheight()-height)//2)}")

        # Red danger line at the top
        top_stripe = tk.Frame(root, bg="#ef4444", height=4)
        top_stripe.pack(fill="x")

        frame = tk.Frame(root, bg="#0b0f19", padx=28, pady=20)
        frame.pack(fill="both", expand=True)

        # Danger Badge
        badge_frame = tk.Frame(frame, bg="#311317", highlightthickness=1, highlightbackground="#991b1b", padx=10, pady=3)
        badge_frame.pack(anchor="w")
        tk.Label(
            badge_frame,
            text="🛡️ ⚠️ CẢNH BÁO BẢO MẬT — DLP SECURITY ALERT",
            font=("Segoe UI", 9, "bold"),
            fg="#f87171",
            bg="#311317"
        ).pack()

        # Dynamic Title
        title = tk.Label(
            frame,
            text="Phát hiện thông tin nhạy cảm trong Screenshot!",
            font=("Segoe UI", 16, "bold"),
            fg="#ffffff",
            bg="#0b0f19",
            wraplength=480,
            justify="left"
        )
        title.pack(anchor="w", pady=(12, 6))

        # Description
        desc = tk.Label(
            frame,
            text="Ảnh chụp màn hình vừa tạo có chứa dữ liệu nguy cấp (Mật khẩu, Token, Khóa 2FA hoặc CCCD/SĐT).",
            font=("Segoe UI", 9),
            fg="#cbd5e1",
            bg="#0b0f19",
            wraplength=480,
            justify="left"
        )
        desc.pack(anchor="w")

        # Warning Alert Box
        warn_box = tk.Frame(frame, bg="#18181b", highlightthickness=1, highlightbackground="#7f1d1d", padx=14, pady=10)
        warn_box.pack(fill="x", pady=(12, 14))
        tk.Label(
            warn_box,
            text="⛔ NGUY CƠ RÒ RỈ DỮ LIỆU: Tuyệt đối KHÔNG chia sẻ ảnh này lên chat, mạng xã hội hoặc ticket khi chưa che kín thông tin bí mật!",
            font=("Segoe UI", 9, "bold"),
            fg="#fca5a5",
            bg="#18181b",
            wraplength=450,
            justify="left"
        ).pack(anchor="w")

        current = {"key": None, "expires": 0}

        def dismiss():
            current["key"] = None
            root.withdraw()
            emit("visible", False)

        def review():
            key = current["key"]
            if key and current["expires"] > time.monotonic():
                webbrowser.open(f"{base_url}/#/scanner?review={key}")
            dismiss()

        # Action Buttons
        actions = tk.Frame(frame, bg="#0b0f19")
        actions.pack(fill="x", pady=(2, 12))

        primary = tk.Button(
            actions,
            text="🛡️ Xem và che ảnh ngay",
            command=review,
            bg="#dc2626",
            fg="#ffffff",
            activebackground="#b91c1c",
            activeforeground="#ffffff",
            font=("Segoe UI", 11, "bold"),
            relief="flat",
            padx=20,
            pady=9,
            cursor="hand2"
        )
        primary.pack(side="left")

        btn_close = tk.Button(
            actions,
            text="Bỏ qua",
            command=dismiss,
            bg="#1f2937",
            fg="#9ca3af",
            activebackground="#374151",
            activeforeground="#ffffff",
            font=("Segoe UI", 10),
            relief="flat",
            padx=16,
            pady=9,
            cursor="hand2"
        )
        btn_close.pack(side="left", padx=12)

        footer = tk.Label(
            frame,
            text="Ảnh chưa được che. Phiên review bảo mật được mã hóa và tự hủy sau 10 phút.",
            font=("Segoe UI", 8),
            fg="#64748b",
            bg="#0b0f19",
            justify="left"
        )
        footer.pack(anchor="w")

        root.protocol("WM_DELETE_WINDOW", dismiss)
        root.bind("<Escape>", lambda _: dismiss())
        root.bind("<Return>", lambda _: review())

        def tick():
            parent = multiprocessing.parent_process()
            if parent and not parent.is_alive():
                root.destroy()
                return
            try:
                while True:
                    command = commands.get_nowait()
                    if command[0] == "stop":
                        root.destroy()
                        return
                    if command[0] == "clear":
                        dismiss()
                    elif command[0] == "discard" and command[1] == current["key"]:
                        dismiss()
                    elif command[0] == "show":
                        _, count, key, expires = command
                        if expires <= time.monotonic():
                            continue
                        current.update(key=key, expires=expires)
                        title.config(text=f"Phát hiện {count} vùng thông tin nhạy cảm!")
                        root.deiconify()
                        root.lift()
                        root.focus_force()
                        primary.focus_set()
                        root.bell()
                        root.update_idletasks()
                        emit("visible", bool(root.winfo_viewable()))
            except queue.Empty:
                pass
            if current["key"] and current["expires"] <= time.monotonic():
                dismiss()
            root.after(100, tick)

        emit("ready", True)
        root.after(100, tick)
        root.mainloop()
    except Exception:
        try:
            events.put(("failed", True))
        except Exception:
            pass


class DesktopPopup:
    def __init__(self, base_url):
        self.base_url = base_url
        self.process = None
        self.ready = self.visible = False
        self.failed = False
        self._lock = threading.Lock()

    def start(self):
        with self._lock:
            if self.process is not None:
                return
            if os.name != "nt":
                self.failed = True
                return
            context = multiprocessing.get_context("spawn")
            self.commands, self.events = context.Queue(32), context.Queue(64)
            self.process = context.Process(target=popup_main, args=(self.commands, self.events, self.base_url), name="ScreenGuardPopup", daemon=True)
            try:
                self.process.start()
            except Exception:
                self.failed = True
                self.process = None
                self.commands.close()
                self.events.close()

    def status(self):
        with self._lock:
            if self.process:
                try:
                    while True:
                        key, value = self.events.get_nowait()
                        if key == "ready": self.ready = value
                        elif key == "visible": self.visible = value
                        elif key == "failed": self.failed = value
                except (queue.Empty, OSError):
                    pass
            alive = bool(self.process and self.process.is_alive())
            return {"available": alive and self.ready and not self.failed, "visible": alive and self.visible, "failed": self.failed or bool(self.process and not alive)}

    def _send(self, value):
        if self.process and self.process.is_alive():
            try: self.commands.put_nowait(value)
            except (queue.Full, OSError): self.failed = True

    def show(self, count, key, ttl=600):
        if not isinstance(count, int) or not 1 <= count <= 500 or not re.fullmatch(r"[A-Za-z0-9_-]{40,64}", key):
            return False
        self.start()
        self._send(("show", count, key, time.monotonic()+ttl))
        return not self.failed

    def discard(self, key): self._send(("discard", key))
    def clear(self): self._send(("clear",))

    def close(self):
        self._send(("stop",))
        if self.process:
            self.process.join(timeout=3)
            if self.process.is_alive():
                self.process.terminate()
            self.process = None
        self.commands.close()
        self.events.close()
