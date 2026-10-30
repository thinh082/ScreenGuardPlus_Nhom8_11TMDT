"""Unit tests for launcher.py port checking, supervisor lifecycle, and safety boundaries."""
import socket
import threading
import time
import pytest

from launcher import is_port_in_use, probe_screenguard, wait_for_health, ScreenGuardSupervisor


def get_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_is_port_in_use_detects_free_and_bound_ports():
    port = get_free_port()
    assert is_port_in_use("127.0.0.1", port) is False

    # Bind port temporarily
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", port))
    s.listen(1)
    try:
        assert is_port_in_use("127.0.0.1", port) is True
    finally:
        s.close()


def test_supervisor_lifecycle_on_random_port():
    port = get_free_port()
    supervisor = ScreenGuardSupervisor(host="127.0.0.1", port=port, auto_browser=False)
    
    assert supervisor.start() is True
    try:
        # Check that server responds to health check
        assert wait_for_health("127.0.0.1", port, timeout=3.0) is True
        # Probe recognises ScreenGuard+
        assert probe_screenguard("127.0.0.1", port) is True
    finally:
        supervisor.stop()
    
    # After stopping, port should be released within a short period
    time.sleep(0.5)
    # Give OS a moment to release socket
    for _ in range(10):
        if not is_port_in_use("127.0.0.1", port):
            break
        time.sleep(0.2)
    assert is_port_in_use("127.0.0.1", port) is False

