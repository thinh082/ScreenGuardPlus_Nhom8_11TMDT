"""Rebuild the app's original geometric icons with Pillow (no external assets)."""
from pathlib import Path

from PIL import Image, ImageDraw

target = Path(__file__).resolve().parents[1] / "frontend" / "icons"
target.mkdir(parents=True, exist_ok=True)
for size in (192, 512):
    scale = 4
    image = Image.new("RGB", (size * scale, size * scale), "#122631")
    draw = ImageDraw.Draw(image)
    def points(coords):
        return [(int(x * size * scale), int(y * size * scale)) for x, y in coords]
    shield = points([(.5,.21),(.76,.31),(.75,.52),(.69,.65),(.59,.74),(.5,.8),(.41,.74),(.31,.65),(.25,.52),(.24,.31),(.5,.21)])
    draw.line(shield, fill="#6ce6c5", width=int(size * scale * .027), joint="curve")
    draw.line(points([(.37,.48),(.46,.57),(.64,.39)]), fill="#6ce6c5", width=int(size * scale * .03), joint="curve")
    image.resize((size, size), Image.Resampling.LANCZOS).save(target / f"icon-{size}.png")
