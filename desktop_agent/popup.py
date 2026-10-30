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
        if os.name == "nt":
            try:
                import ctypes
                u32 = ctypes.windll.user32
                h_def = u32.OpenDesktopW("Default", 0, False, 0x01FF)
                if h_def:
                    u32.SetThreadDesktop(h_def)
            except Exception:
                pass

        import tkinter as tk
        import webbrowser

        def emit(kind, value):
            try:
                events.put_nowait((kind, value))
            except queue.Full:
                try:
                    events.get_nowait()
                    events.put_nowait((kind, value))
                except (queue.Empty, queue.Full):
                    pass

        root = tk.Tk()
        root.withdraw()
        root.title("ScreenGuard+ — Cảnh Báo Bảo Mật")
        root.configure(bg="#0B1422")
        root.resizable(False, False)
        root.attributes("-topmost", True)

        try:
            from core.resources import get_icon_path
            ico = get_icon_path("app.ico")
            if ico.is_file():
                root.iconbitmap(str(ico))
        except Exception:
            pass

        width, height = 460, 295
        sw = root.winfo_screenwidth()
        sh = root.winfo_screenheight()
        x = max(0, (sw - width) // 2)
        y = max(0, (sh - height) // 2)
        root.geometry(f"{width}x{height}+{x}+{y}")

        # Outer border frame
        outer = tk.Frame(root, bg="#0B1422", highlightthickness=1, highlightbackground="#26364A")
        outer.pack(fill="both", expand=True)

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

        # --- HEADER ---
        header = tk.Frame(outer, bg="#0B1422", padx=20, pady=12)
        header.pack(fill="x")

        header_left = tk.Frame(header, bg="#0B1422")
        header_left.pack(side="left")

        # Vector shield canvas (clean Teal graphic, no emoji)
        shield = tk.Canvas(header_left, width=16, height=18, bg="#0B1422", highlightthickness=0)
        shield.pack(side="left", padx=(0, 8))
        shield.create_polygon(
            1, 2, 15, 2, 15, 9, 8, 16, 1, 9,
            fill="#14B8A6", outline="#2DD4BF", width=1
        )
        shield.create_line(5, 8, 8, 11, 12, 6, fill="#0B1422", width=1.5)

        app_title = tk.Label(
            header_left,
            text="ScreenGuard+",
            font=("Segoe UI", 10, "bold"),
            fg="#F8FAFC",
            bg="#0B1422"
        )
        app_title.pack(side="left")

        # Soft badge pill
        badge_frame = tk.Frame(header_left, bg="#142235", highlightthickness=1, highlightbackground="#26364A", padx=6, pady=1)
        badge_frame.pack(side="left", padx=(10, 0))
        badge_label = tk.Label(
            badge_frame,
            text="Bảo mật",
            font=("Segoe UI", 8, "bold"),
            fg="#38BDF8",
            bg="#142235"
        )
        badge_label.pack()

        # Close button '✕'
        btn_close_x = tk.Label(
            header,
            text="✕",
            font=("Segoe UI", 10),
            fg="#94A3B8",
            bg="#0B1422",
            cursor="hand2",
            padx=4,
            pady=0
        )
        btn_close_x.pack(side="right")
        btn_close_x.bind("<Enter>", lambda _: btn_close_x.configure(fg="#F8FAFC"))
        btn_close_x.bind("<Leave>", lambda _: btn_close_x.configure(fg="#94A3B8"))
        btn_close_x.bind("<Button-1>", lambda _: dismiss())

        # Divider
        div = tk.Frame(outer, bg="#1E293B", height=1)
        div.pack(fill="x", padx=20)

        # --- MAIN BODY ---
        body = tk.Frame(outer, bg="#0B1422", padx=20, pady=12)
        body.pack(fill="x")

        title_label = tk.Label(
            body,
            text="Phát hiện dữ liệu nhạy cảm",
            font=("Segoe UI", 13, "bold"),
            fg="#F8FAFC",
            bg="#0B1422",
            anchor="w"
        )
        title_label.pack(fill="x")

        subtitle = tk.Label(
            body,
            text="Ảnh chụp màn hình vừa tạo có thông tin cần kiểm tra trước khi chia sẻ.",
            font=("Segoe UI", 9),
            fg="#94A3B8",
            bg="#0B1422",
            wraplength=415,
            justify="left",
            anchor="w"
        )
        subtitle.pack(fill="x", pady=(3, 8))

        # Card container for count and chips
        card = tk.Frame(body, bg="#142235", highlightthickness=1, highlightbackground="#26364A", padx=12, pady=8)
        card.pack(fill="x")

        count_label = tk.Label(
            card,
            text="Đã phát hiện 1 vùng cần bảo vệ:",
            font=("Segoe UI", 9, "bold"),
            fg="#14B8A6",
            bg="#142235",
            anchor="w"
        )
        count_label.pack(fill="x")

        # Dynamic Chips Row
        chips_row = tk.Frame(card, bg="#142235", pady=3)
        chips_row.pack(fill="x")

        # Security advice row
        advice_row = tk.Frame(body, bg="#0B1422", pady=8)
        advice_row.pack(fill="x")

        dot = tk.Canvas(advice_row, width=6, height=6, bg="#0B1422", highlightthickness=0)
        dot.pack(side="left", padx=(0, 6))
        dot.create_oval(1, 1, 5, 5, fill="#14B8A6", outline="#14B8A6")

        tk.Label(
            advice_row,
            text="Nên kiểm tra và che thông tin trước khi chia sẻ ảnh.",
            font=("Segoe UI", 8),
            fg="#94A3B8",
            bg="#0B1422"
        ).pack(side="left")

        # --- ACTION BUTTONS ---
        actions = tk.Frame(outer, bg="#0B1422", padx=20, pady=4)
        actions.pack(fill="x", pady=(2, 8))

        primary = tk.Button(
            actions,
            text="Xem & che ngay",
            font=("Segoe UI", 10, "bold"),
            bg="#14B8A6",
            fg="#0B1422",
            activebackground="#0D9488",
            activeforeground="#FFFFFF",
            relief="flat",
            cursor="hand2",
            padx=18,
            pady=6,
            command=review
        )
        primary.pack(side="left")
        primary.bind("<Enter>", lambda _: primary.configure(bg="#2DD4BF"))
        primary.bind("<Leave>", lambda _: primary.configure(bg="#14B8A6"))

        secondary = tk.Button(
            actions,
            text="Để sau",
            font=("Segoe UI", 9),
            bg="#142235",
            fg="#94A3B8",
            activebackground="#1E293B",
            activeforeground="#F8FAFC",
            relief="flat",
            cursor="hand2",
            padx=16,
            pady=6,
            highlightthickness=1,
            highlightbackground="#26364A",
            command=dismiss
        )
        secondary.pack(side="left", padx=(10, 0))
        secondary.bind("<Enter>", lambda _: secondary.configure(bg="#1E293B", fg="#F8FAFC"))
        secondary.bind("<Leave>", lambda _: secondary.configure(bg="#142235", fg="#94A3B8"))

        # --- FOOTER ---
        footer = tk.Frame(outer, bg="#0B1422", padx=20, pady=2)
        footer.pack(fill="x", pady=(0, 10))

        tk.Label(
            footer,
            text="Phiên xem lại có hiệu lực tối đa 10 phút.",
            font=("Segoe UI", 8),
            fg="#64748B",
            bg="#0B1422"
        ).pack(side="left")

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
                        count = command[1]
                        key = command[2]
                        expires = command[3]
                        categories = command[4] if len(command) > 4 else None
                        max_risk = command[5] if len(command) > 5 else "high"

                        if expires <= time.monotonic():
                            continue
                        current.update(key=key, expires=expires)

                        # Update count text
                        v_text = f"Đã phát hiện {count} vùng cần bảo vệ:" if count > 1 else "Đã phát hiện 1 vùng cần bảo vệ:"
                        count_label.config(text=v_text)

                        # Update risk badge
                        if max_risk == "critical":
                            badge_frame.config(bg="#301D25", highlightbackground="#4C1D24")
                            badge_label.config(text="Rủi ro cao", fg="#F87171", bg="#301D25")
                        else:
                            badge_frame.config(bg="#142235", highlightbackground="#26364A")
                            badge_label.config(text="Bảo mật", fg="#38BDF8", bg="#142235")

                        # Populate chips
                        for child in chips_row.winfo_children():
                            child.destroy()
                        cats_to_show = categories if categories else ["Thông tin nhạy cảm"]
                        for cat in cats_to_show[:4]:
                            chip = tk.Frame(chips_row, bg="#0B1422", highlightthickness=1, highlightbackground="#26364A", padx=7, pady=2)
                            chip.pack(side="left", padx=(0, 6))
                            tk.Label(
                                chip,
                                text=cat,
                                font=("Segoe UI", 8),
                                fg="#F1F5F9",
                                bg="#0B1422"
                            ).pack()

                        # Recalculate screen center
                        c_sw = root.winfo_screenwidth()
                        c_sh = root.winfo_screenheight()
                        c_x = max(0, (c_sw - width) // 2)
                        c_y = max(0, (c_sh - height) // 2)
                        root.geometry(f"{width}x{height}+{c_x}+{c_y}")

                        root.deiconify()
                        root.attributes("-topmost", True)
                        root.lift()
                        root.focus_force()
                        primary.focus_set()
                        root.bell()

                        try:
                            import ctypes
                            u32 = ctypes.windll.user32
                            k32 = ctypes.windll.kernel32
                            frame_val = root.wm_frame()
                            hwnd = int(frame_val, 16) if str(frame_val).startswith("0x") else int(frame_val)
                            u32.SetWindowPos(hwnd, -1, 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0040)
                            fore = u32.GetWindowThreadProcessId(u32.GetForegroundWindow(), None)
                            cur = k32.GetCurrentThreadId()
                            if fore and fore != cur:
                                u32.AttachThreadInput(fore, cur, True)
                                u32.BringWindowToTop(hwnd)
                                u32.SetForegroundWindow(hwnd)
                                u32.AttachThreadInput(fore, cur, False)
                            else:
                                u32.BringWindowToTop(hwnd)
                                u32.SetForegroundWindow(hwnd)
                        except Exception:
                            pass

                        root.update()
                        emit("visible", True)
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

    def show(self, count, key, ttl=600, *, categories=None, max_risk="high"):
        if not isinstance(count, int) or not 1 <= count <= 500 or not re.fullmatch(r"[A-Za-z0-9_-]{40,64}", key):
            return False
        self.start()
        self._send(("show", count, key, time.monotonic() + ttl, categories, max_risk))
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
