"""Measure real file-close -> watcher -> OCR -> notification callback latency.

Uses an explicitly isolated worktree folder and a count/ID recorder. Native toast
delivery is tested separately. No observer/OCR parallelism changes are made.
"""

import argparse
import hashlib
import json
from pathlib import Path
import statistics
import tempfile
import time

from desktop_agent.controller import Companion
from desktop_agent.settings import AgentSettings, save_settings
from tests.qa.corpus import CASES, Case, render


def wait(check, timeout=20):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if check():
            return
        time.sleep(0.02)
    raise AssertionError("Real watcher did not complete within 20 seconds")


def measure(output):
    root = Path("tmp/pre-demo-latency").resolve()
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="run-", dir=root) as directory:
        directory = Path(directory)
        folder = directory / "Screenshots"
        folder.mkdir()
        path = directory / "consent.json"
        settings = AgentSettings(folder=str(folder), enabled=True, popup_enabled=False)
        settings.config.language = "eng"
        save_settings(path, settings)

        class Recorder:
            last_status = "not_sent"

            def __init__(self):
                self.items = []

            def notify(self, count, key):
                review = agent.reviews.get(key)
                self.items.append(
                    {
                        "count": count,
                        "sha256": review.result.image_hash,
                        "completed": time.perf_counter(),
                    }
                )
                self.last_status = "submitted"
                return True

            def clear(self):
                pass

        recorder = Recorder()
        agent = Companion("http://127.0.0.1:8047", path=path, notifier=recorder)
        try:
            agent.start()
            assert agent.status()["running"]
            # Negative set covers imagery, browser UI, prose and fixed definitions.
            clean_cases = [c for c in CASES if not c.expected]
            for index, case in enumerate(clean_cases):
                (folder / f"clean-{index}.png").write_bytes(render(case)[0])
                wait(lambda: agent.status()["scanned"] == index + 1)
                assert (
                    not recorder.items
                ), f"False alert on authored negative: {case.id}"
            starts = {}
            for index in range(5):
                case = Case(
                    f"burst-{index}",
                    "TC10",
                    (
                        f"Capture {index}",
                        f"DATABASE_PASSWORD=FictitiousBatchPass{index}123!",
                    ),
                    ((1, "DB_CREDENTIAL"),),
                    style="terminal",
                )
                payload = render(case)[0]
                digest = hashlib.sha256(payload).hexdigest()
                # Start before writing: includes file write time and debounce.
                starts[digest] = time.perf_counter()
                (folder / f"burst-{index}.png").write_bytes(payload)
            wait(lambda: len(recorder.items) == 5)
            latencies = [
                round((item["completed"] - starts[item["sha256"]]) * 1000, 2)
                for item in recorder.items
            ]
            assert all(item["count"] == 1 for item in recorder.items)
            assert agent.status()["dropped"] == 0 and agent.status()["rejected"] == 0
            duplicate = render(
                Case(
                    "burst-0",
                    "TC10",
                    ("Capture 0", "DATABASE_PASSWORD=FictitiousBatchPass0123!"),
                    ((1, "DB_CREDENTIAL"),),
                    style="terminal",
                )
            )[0]
            (folder / "duplicate.png").write_bytes(duplicate)
            wait(lambda: agent.status()["duplicates"] == 1)
            assert len(recorder.items) == 5
            result = {
                "clock": "perf_counter",
                "language": "eng",
                "clean_images_scanned": len(clean_cases),
                "false_sensitive_alerts": 0,
                "burst_images_written": 5,
                "secret_alerts": 5,
                "latency_ms": latencies,
                "median_ms": statistics.median(latencies),
                "max_ms": max(latencies),
                "duplicates_suppressed": 1,
                "dropped": agent.status()["dropped"],
                "rejected": agent.status()["rejected"],
                "scope": "file write -> debounce -> real serial OCR -> notification callback; not display latency; no Win+PrtScn hardware automation",
            }
            target = Path(output)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(result, indent=2))
            print(json.dumps(result))
        finally:
            agent.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    measure(parser.parse_args().output)
