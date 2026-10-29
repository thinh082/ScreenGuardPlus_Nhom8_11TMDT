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
        root.title("ScreenGuard+ — Kiểm tra screenshot")
        root.configure(bg="#f5f6f8")
        root.resizable(False, False)
        root.attributes("-topmost", True)
        width, height = 540, 380
        root.geometry(f"{width}x{height}+{max(0,(root.winfo_screenwidth()-width)//2)}+{max(0,(root.winfo_screenheight()-height)//2)}")
        frame = tk.Frame(root, bg="#f5f6f8", padx=30, pady=26)
        frame.pack(fill="both", expand=True)
        tk.Label(frame, text="SCREENGUARD+", bg="#f5f6f8", fg="#087b65", font=("Segoe UI", 11, "bold")).pack(anchor="w")
        title = tk.Label(frame, bg="#f5f6f8", fg="#262b35", font=("Segoe UI", 19, "bold"), wraplength=460, justify="left")
        title.pack(anchor="w", pady=(15, 10))
        tk.Label(frame, text="Kiểm tra và chọn vùng cần che trước khi chia sẻ.", bg="#f5f6f8", fg="#606b7b", font=("Segoe UI", 11), wraplength=460, justify="left").pack(anchor="w")
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

        actions = tk.Frame(frame, bg="#f5f6f8")
        actions.pack(fill="x", pady=(24, 10))
        primary = tk.Button(actions, text="Xem và che ảnh", command=review, bg="#087b65", fg="white", activebackground="#096c5a", activeforeground="white", font=("Segoe UI", 11, "bold"), relief="flat", padx=20, pady=10, cursor="hand2")
        primary.pack(side="left")
        tk.Button(actions, text="Đóng", command=dismiss, bg="#e9edf1", fg="#262b35", font=("Segoe UI", 11), relief="flat", padx=20, pady=10, cursor="hand2").pack(side="left", padx=12)
        tk.Label(frame, text="Ảnh chưa được che. Các ảnh chờ nằm trong mục Thông báo.", bg="#f5f6f8", fg="#606b7b", font=("Segoe UI", 10), wraplength=460, justify="left").pack(anchor="w")
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
                        title.config(text=f"Screenshot có {count} vùng cần kiểm tra")
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
                self.process.join(timeout=2)
            self.commands.close()
            self.events.close()
