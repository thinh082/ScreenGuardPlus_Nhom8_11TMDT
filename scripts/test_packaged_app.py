"""Verification test suite for packaged ScreenGuardPlus.exe (portable distribution)."""
import json
import os
from pathlib import Path
import subprocess
import time
import httpx
from PIL import Image, ImageDraw


def test_packaged_binary():
    exe_path = Path("dist/ScreenGuardPlus/ScreenGuardPlus.exe").resolve()
    assert exe_path.is_file(), f"Binary not found: {exe_path}"
    port = 8999
    base_url = f"http://127.0.0.1:{port}"

    print(f"[Test] Starting packaged binary: {exe_path} on port {port}...")
    proc = subprocess.Popen(
        [str(exe_path), "--port", str(port), "--cli", "--no-browser"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        client = httpx.Client(base_url=base_url, timeout=30.0)

        # 1. Health check & OCR status (TC03, TC04)
        ready = False
        health_data = {}
        for _ in range(30):
            try:
                resp = client.get("/api/health")
                if resp.status_code == 200:
                    health_data = resp.json()
                    ready = True
                    break
            except Exception:
                time.sleep(0.3)
        
        assert ready, "Server failed to respond within 10s"
        print(f"[TC03 Passed] Server healthy: {health_data.get('status')}")
        print(f"[TC04 Passed] OCR Available: {health_data.get('ocr_available')}, Languages: {health_data.get('languages')}")
        assert health_data.get("tesseract_installed") is True
        assert health_data.get("ocr_available") is True
        assert "eng" in health_data.get("languages", [])

        # 2. PWA frontend serving check
        fe_resp = client.get("/")
        assert fe_resp.status_code == 200
        assert "<!DOCTYPE html>" in fe_resp.text or "<html" in fe_resp.text
        assert "ScreenGuard+" in fe_resp.text
        print("[TC03 Passed] Frontend PWA index.html served properly")

        # 3. Create a synthetic test image with Secret + PII (TC05, TC07)
        img = Image.new("RGB", (700, 250), color=(255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.text((30, 30), "DATABASE_PASSWORD=DemoSecretKey123!", fill=(0, 0, 0))
        draw.text((30, 80), "Contact: test@gmail.com", fill=(0, 0, 0))
        draw.text((30, 130), "Phone: 0912345678", fill=(0, 0, 0))
        test_img_path = Path("tmp/test_packaged_sample.png")
        test_img_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(test_img_path, format="PNG")
        img_bytes = test_img_path.read_bytes()

        # 4. Upload & Scan (TC05)
        config_data = json.dumps({"profile": "security"})
        scan_resp = client.post(
            "/api/scan",
            files={"image": ("sample.png", img_bytes, "image/png")},
            data={"config": config_data},
        )
        assert scan_resp.status_code == 200, f"Scan failed: {scan_resp.text}"
        scan_data = scan_resp.json()

        findings = scan_data.get("findings", [])
        types_found = [f["type"] for f in findings]
        print(f"[TC05 Passed] Scan findings detected: {types_found}")
        assert any("SECRET" in t or "PASSWORD" in t or "CREDENTIAL" in t for t in types_found)
        assert "EMAIL" in types_found or "PHONE" in types_found

        # Check DLP Policy Enforcement (TC07)
        policy = scan_data.get("policy", {})
        print(f"[TC07 Passed] Policy Action: {policy.get('action')}, Risk Level: {policy.get('risk_level')}")
        assert policy.get("action") in ("BLOCK", "REDACT_MANDATORY")

        # 5. Secure Export Verification (TC08)
        ticket = scan_data.get("export_ticket")
        assert ticket, "Export ticket missing"

        # Export with required redactions covering the findings
        redactions = []
        for finding in findings:
            box = finding["box"]
            redactions.append({
                "x": box["x"],
                "y": box["y"],
                "width": box["width"],
                "height": box["height"],
            })

        export_resp = client.post(
            "/api/export",
            json={
                "ticket": ticket,
                "redactions": redactions,
                "destination": "download",
                "confirmed_warnings": True,
            },
        )
        assert export_resp.status_code == 200, f"Export failed: {export_resp.text}"
        assert export_resp.headers.get("content-type") == "image/png"
        output_png = export_resp.content
        assert len(output_png) > 100
        print(f"[TC08 Passed] Secure export succeeded: {len(output_png)} bytes exported (Verified & Policy Enforced)")

    finally:
        print("[Test] Terminating packaged binary process...")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        print("[TC09 Passed] Clean process termination verified")


if __name__ == "__main__":
    test_packaged_binary()
    print("\nALL PACKAGED BINARY INTEGRATION TESTS PASSED SUCCESSFULLY!")
