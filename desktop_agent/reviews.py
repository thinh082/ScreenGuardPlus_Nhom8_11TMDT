"""Bounded, expiring, in-memory review sessions. No image history on disk."""
from collections import OrderedDict
from dataclasses import dataclass
import secrets
import threading
import time
from datetime import datetime, timezone

from core.models import ScanResult


@dataclass(frozen=True)
class Review:
    image: bytes
    result: ScanResult
    expires: float
    created_at: str


class ReviewStore:
    def __init__(self, ttl=600, max_items=8, max_bytes=64 * 1024 * 1024, clock=time.monotonic):
        self.ttl, self.max_items, self.max_bytes = ttl, max_items, max_bytes
        self.clock = clock
        self._items = OrderedDict()
        self._lock = threading.RLock()

    def _prune(self):
        for key, value in list(self._items.items()):
            if value.expires <= self.clock():
                del self._items[key]

    def put(self, image: bytes, result: ScanResult) -> str:
        if len(image) > self.max_bytes:
            raise ValueError("Review exceeds memory budget")
        with self._lock:
            self._prune()
            while self._items and (len(self._items) >= self.max_items or sum(len(v.image) for v in self._items.values()) + len(image) > self.max_bytes):
                self._items.popitem(last=False)
            key = secrets.token_urlsafe(32)
            self._items[key] = Review(image, result, self.clock() + self.ttl, datetime.now(timezone.utc).isoformat())
            return key

    def get(self, key: str) -> Review | None:
        with self._lock:
            self._prune()
            return self._items.get(key)

    def delete(self, key: str):
        with self._lock:
            self._items.pop(key, None)

    def clear(self):
        with self._lock:
            self._items.clear()

    def count(self):
        with self._lock:
            self._prune()
            return len(self._items)

    def notifications(self):
        with self._lock:
            self._prune()
            return [{"id":key,"count":len(value.result.findings),"created_at":value.created_at} for key,value in reversed(self._items.items())]
