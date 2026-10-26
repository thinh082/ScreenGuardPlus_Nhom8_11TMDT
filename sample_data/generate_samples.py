"""Synthetic screenshots for real OCR tests. All identifiers are fictional."""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

CASES = {
    "email": [("Email:", "test.screenguard@example.com")],
    "phone": [("Phone:", "0900000000")],
    "student": [("Student ID:", "SV20260001")],
    "citizen": [("Citizen ID:", "000000000000")],
    "bank": [("Bank account:", "111111111111")],
    "clean": [("Project:", "ScreenGuard Plus"), ("Status:", "Ready for review")],
    "custom": [("Reference:", "NV-246810"), ("Classification:", "CONFIDENTIAL")],
    "split": [("Email:", "test.screenguard @ example.com"), ("Phone:", "090 000 0000")],
    "vietnamese": [("Căn cước công dân:", "000000000000"), ("Số tài khoản:", "111111111111"), ("Mã sinh viên:", "SV20260001")],
}
CASES["all"] = [item for key in ("email", "phone", "student", "citizen", "bank") for item in CASES[key]]


def sample_image(lines):
    font = None
    for candidate in ("C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "Arial.ttf"):
        try:
            font = ImageFont.truetype(candidate, 36)
            break
        except OSError:
            continue
    if font is None:
        raise RuntimeError("Install Arial or DejaVu Sans to generate OCR fixtures.")
    image = Image.new("RGB", (1500, max(240, 100 + len(lines)*90)), "white")
    draw = ImageDraw.Draw(image)
    boxes = []
    for index, (label, value) in enumerate(lines):
        y = 45 + 90*index
        draw.text((50, y), label, font=font, fill="black")
        draw.text((440, y), value, font=font, fill="black")
        boxes.append(list(draw.textbbox((440, y), value, font=font)))
    return image, boxes


if __name__ == "__main__":
    target = Path(__file__).parent / "screenshots"
    target.mkdir(exist_ok=True)
    expected = {}
    for name, lines in CASES.items():
        image, boxes = sample_image(lines)
        image.save(target / f"{name}.png")
        expected[name] = {"values": [value for _, value in lines], "value_boxes": boxes}
    (target / "expected.json").write_text(json.dumps(expected, ensure_ascii=False, indent=2), encoding="utf-8")
