"""Reviewable synthetic ground truth. No fixture-dependent production behavior.

YouTube/ChatGPT cases below are drawn representations, not captured real sites.
All credentials and identifiers are fictional. A match is not a verified secret.
"""

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


@dataclass(frozen=True)
class Case:
    id: str
    tc: str
    lines: tuple[str, ...]
    expected: tuple[tuple[int, str], ...] = ()
    style: str = "document"
    font_size: int = 30
    blur: float = 0
    stress: bool = False
    font_family: str = "mono"


CASES = (
    Case("landscape", "TC01", (), style="landscape"),
    Case(
        "youtube_clean",
        "TC02",
        (
            "YouTube",
            "Search",
            "Relaxing mountain scenery",
            "Nature videos and travel stories",
            "Home   Music   Learning",
        ),
        style="browser",
    ),
    Case(
        "study_networks",
        "TC03",
        (
            "Computer networks",
            "A router forwards packets between networks.",
            "Encryption protects information in transit.",
        ),
    ),
    Case(
        "study_database",
        "TC03",
        (
            "Database normalization",
            "Tables store records and columns describe attributes.",
            "A primary key uniquely identifies each row.",
        ),
    ),
    Case(
        "password_term",
        "TC04",
        (
            "DATABASE_PASSWORD is an environment variable.",
            "Do not publish credentials in documentation.",
        ),
    ),
    Case(
        "password_definition",
        "TC04",
        (
            "DATABASE_PASSWORD: is the password used by an application.",
            "This paragraph explains a concept without a value.",
        ),
    ),
    Case(
        "password_definition_long",
        "TC04",
        ("DATABASE_PASSWORD: stores the database password for an application.",),
    ),
    Case(
        "password_blank",
        "TC04",
        ("DATABASE_PASSWORD=", "Configure this variable on your own machine."),
    ),
    Case(
        "password_placeholder",
        "TC04",
        ("DATABASE_PASSWORD=<your_password>", "DATABASE_PASSWORD=${DB_PASSWORD}"),
    ),
    Case(
        "password_placeholder_words", "TC04", ("DATABASE_PASSWORD=your_password_here",)
    ),
    Case(
        "api_definition",
        "TC03",
        (
            "API_KEY: authentication identifies the calling application.",
            "Tokens should be kept private.",
        ),
    ),
    Case(
        "token_definition",
        "TC03",
        ("Token: authentication is the process of checking identity.",),
    ),
    Case("api_placeholder", "TC03", ("API_KEY=your_api_key_here",)),
    Case(
        "terminal_password",
        "TC05",
        ("PS C:\\Demo>", "DATABASE_PASSWORD=DemoPass123!"),
        ((1, "DB_CREDENTIAL"),),
        style="terminal",
    ),
    Case(
        "chat_password",
        "TC06",
        (
            "ChatGPT - fictional training example",
            "User: Please show a dummy credential assignment.",
            "DATABASE_PASSWORD=DemoPass123!",
            "Assistant: this sample value is not an active password.",
        ),
        ((2, "DB_CREDENTIAL"),),
        style="browser",
    ),
    Case(
        "chat_api",
        "TC06",
        (
            "ChatGPT - fictional token example",
            "API_KEY=DemoApiKey1234567890ABCDEF",
            "This is dummy data for a classroom exercise.",
        ),
        ((1, "API_KEY"),),
        style="browser",
    ),
    Case(
        "chat_mixed_tabs",
        "TC06",
        (
            "Chrome   ChatGPT   YouTube",
            "DATABASE_PASSWORD=DemoPass123!",
            "API_KEY=DemoApiKey1234567890ABCDEF",
            "Music and study recommendations",
        ),
        ((1, "DB_CREDENTIAL"), (2, "API_KEY")),
        style="browser",
    ),
    Case("email", "TC07", ("Email: privacy.test@example.com",), ((0, "EMAIL"),)),
    Case("citizen", "TC07", ("Citizen ID: 000000000000",), ((0, "CITIZEN_ID"),)),
    Case(
        "citizen_sans",
        "TC07",
        ("Citizen ID: 000000000000",),
        ((0, "CITIZEN_ID"),),
        font_family="sans",
    ),
    Case("bank", "TC07", ("Account number: 111111111111",), ((0, "BANK_ACCOUNT"),)),
    Case(
        "pii_mixed",
        "TC07",
        (
            "Email: privacy.test@example.com",
            "Citizen ID: 000000000000",
            "Account number: 111111111111",
        ),
        ((0, "EMAIL"), (1, "CITIZEN_ID"), (2, "BANK_ACCOUNT")),
    ),
    Case(
        "postgres",
        "TC05",
        ("postgresql://demo:DemoPass123!@localhost:5432/demo",),
        ((0, "DB_CREDENTIAL"),),
    ),
    Case(
        "small_password",
        "TC08",
        ("DATABASE_PASSWORD=DemoPass123!",),
        ((0, "DB_CREDENTIAL"),),
        font_size=10,
        stress=True,
    ),
    Case(
        "blurred_password",
        "TC08",
        ("DATABASE_PASSWORD=DemoPass123!",),
        ((0, "DB_CREDENTIAL"),),
        font_size=14,
        blur=1.8,
        stress=True,
    ),
    Case(
        "blurred_email",
        "TC08",
        ("Email: privacy.test@example.com",),
        ((0, "EMAIL"),),
        font_size=12,
        blur=2,
        stress=True,
    ),
)


def font(size, family="mono"):
    candidates = (
        (
            "C:/Windows/Fonts/arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        )
        if family == "sans"
        else (
            "C:/Windows/Fonts/consola.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
        )
    )
    for path in candidates:
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    raise RuntimeError("Consolas or DejaVuSansMono is required for reproducible OCR QA")


def render(case):
    """Return PNG + ground truth rectangles from the authored source text."""
    if case.style == "landscape":
        image = Image.new("RGB", (1100, 600), "#c4e2f7")
        draw = ImageDraw.Draw(image)
        draw.ellipse((800, 45, 910, 155), fill="#fff1a8")
        draw.polygon([(0, 410), (290, 80), (610, 470)], fill="#598c89")
        draw.polygon([(340, 480), (740, 150), (1100, 450)], fill="#326f78")
        draw.rectangle((0, 460, 1100, 600), fill="#8dc7bf")
        boxes = []
    else:
        face = font(case.font_size, case.font_family)
        top = 90 if case.style == "browser" else 35
        step = max(45, case.font_size + 24)
        width = max(1200, int(max(face.getlength(line) for line in case.lines)) + 100)
        image = Image.new(
            "RGB",
            (width, max(300, top + len(case.lines) * step + 40)),
            "#151b25" if case.style == "terminal" else "white",
        )
        draw = ImageDraw.Draw(image)
        if case.style == "browser":
            draw.rectangle((0, 0, width, 60), fill="#eef1f5")
            draw.text(
                (35, 15),
                "Chrome - synthetic browser screenshot",
                font=font(22),
                fill="#263144",
            )
        boxes = []
        for index, line in enumerate(case.lines):
            xy = (40, top + index * step)
            boxes.append(tuple(draw.textbbox(xy, line, font=face)))
            draw.text(
                xy,
                line,
                font=face,
                fill="white" if case.style == "terminal" else "black",
            )
        if case.blur:
            image = image.filter(ImageFilter.GaussianBlur(case.blur))
    out = BytesIO()
    image.save(out, format="PNG")
    return out.getvalue(), boxes
