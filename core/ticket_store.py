"""In-memory bounded store for Scan Tickets.

Links server-validated findings with original image bytes and SHA-256 hash.
Prevents client-side tampering during export.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import threading
import time
from uuid import uuid4

from core.models import Finding

MAX_TICKETS = 50
MAX_TICKET_BYTES = 64 * 1024 * 1024
TICKET_TTL_SECONDS = 600  # 10 minutes


@dataclass
class ScanTicket:
    ticket_id: str
    image_bytes: bytes
    image_sha256: str
    width: int
    height: int
    findings: list[Finding]
    content_type: str
    profile: str = "security"
    created_at: float = field(default_factory=time.monotonic)
    expires_at: float = field(
        default_factory=lambda: time.monotonic() + TICKET_TTL_SECONDS
    )

    def is_expired(self) -> bool:
        return time.monotonic() >= self.expires_at


class TicketStore:
    def __init__(
        self,
        max_size: int = MAX_TICKETS,
        max_bytes: int = MAX_TICKET_BYTES,
        ttl: float = TICKET_TTL_SECONDS,
    ) -> None:
        self.max_size = max_size
        self.max_bytes = max_bytes
        self.ttl = ttl
        self._tickets: dict[str, ScanTicket] = {}
        self._lock = threading.Lock()
        self._timer: threading.Timer | None = None

    def _schedule_locked(self):
        if self._timer:
            self._timer.cancel()
            self._timer = None
        if self._tickets:
            delay = max(
                0.01,
                min(t.expires_at for t in self._tickets.values()) - time.monotonic(),
            )
            self._timer = threading.Timer(delay, self._expire)
            self._timer.daemon = True
            self._timer.start()

    def _expire(self):
        with self._lock:
            self._purge_expired_locked()
            self._schedule_locked()

    def _purge_expired_locked(self) -> None:
        now = time.monotonic()
        expired = [tid for tid, t in self._tickets.items() if now >= t.expires_at]
        for tid in expired:
            del self._tickets[tid]

    def create_ticket(
        self,
        image_bytes: bytes,
        findings: list[Finding],
        width: int,
        height: int,
        content_type: str = "image/png",
        profile: str = "security",
    ) -> ScanTicket:
        if len(image_bytes) > self.max_bytes or self.max_size < 1:
            raise ValueError("Scan ticket exceeds memory budget")
        with self._lock:
            self._purge_expired_locked()
            # If still over capacity, evict oldest
            while self._tickets and (
                len(self._tickets) >= self.max_size
                or sum(len(t.image_bytes) for t in self._tickets.values())
                + len(image_bytes)
                > self.max_bytes
            ):
                oldest_id = min(
                    self._tickets.keys(), key=lambda k: self._tickets[k].created_at
                )
                del self._tickets[oldest_id]

            ticket_id = uuid4().hex
            image_sha256 = hashlib.sha256(image_bytes).hexdigest()
            ticket = ScanTicket(
                ticket_id=ticket_id,
                image_bytes=image_bytes,
                image_sha256=image_sha256,
                width=width,
                height=height,
                findings=[
                    f.model_copy(update={"text": "[REDACTED]"}) for f in findings
                ],
                content_type=content_type,
                profile=profile,
                expires_at=time.monotonic() + self.ttl,
            )
            self._tickets[ticket_id] = ticket
            self._schedule_locked()
            return ticket

    def get_ticket(self, ticket_id: str) -> ScanTicket | None:
        with self._lock:
            self._purge_expired_locked()
            ticket = self._tickets.get(ticket_id)
            if ticket and not ticket.is_expired():
                return ticket
            return None

    def invalidate_ticket(self, ticket_id: str) -> None:
        with self._lock:
            self._tickets.pop(ticket_id, None)
            self._schedule_locked()

    def clear(self):
        with self._lock:
            self._tickets.clear()
            self._schedule_locked()


# Global singleton store instance
ticket_store = TicketStore()
