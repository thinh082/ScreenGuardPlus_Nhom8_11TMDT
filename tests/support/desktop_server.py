"""E2E harness: real Watchdog/OCR/API; record only toast counts and random IDs.

No test endpoints are added to the production application.
"""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.main import create_app
from desktop_agent.controller import Companion
import uvicorn

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, required=True)
parser.add_argument("--directory", required=True)
args = parser.parse_args()
directory = Path(args.directory)
folder = directory / "Screenshots"
folder.mkdir()


class RecordedNotifications:
    last_status = "not_sent"

    def __init__(self):
        self.items = []

    def notify(self, count, key):
        self.items.append({"count": count, "id": key})
        temporary = directory / "notifications.tmp"
        temporary.write_text(json.dumps(self.items), encoding="utf-8")
        temporary.replace(directory / "notifications.json")
        self.last_status = "submitted"
        return True

    def clear(self):
        pass


agent = Companion(f"http://127.0.0.1:{args.port}", path=directory / "settings.json", notifier=RecordedNotifications(), picker=lambda: str(folder))
uvicorn.run(create_app(agent), host="127.0.0.1", port=args.port, access_log=False, proxy_headers=False)
