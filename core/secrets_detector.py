"""Detection engine for Developer & Infrastructure Secrets.

Identifies Database credentials, API keys, Cloud tokens, Private keys, JWTs,
and Internal Network ranges. Never logs or returns raw secrets.
"""

from __future__ import annotations

import re
from uuid import uuid4

from core.models import BoundingBox, DetectionConfig, Finding, OCRResult
from core.ocr import build_lines

# --- Patterns for Developer Secrets ---

# Database connection strings (PostgreSQL, MySQL, MongoDB, Redis)
DB_URI_PATTERN = re.compile(
    r"(?i)\b(?:postgresql|postgres|mysql|mongodb(?:\+srv)?|rediss?):\s*\/\/\s*(?:[a-zA-Z0-9_\-\.%]*):(?P<secret>[^@\s\/]{3,})@(?P<host>[a-zA-Z0-9_\-\.]+)(?:\s*:\d+)?(?:\/[a-zA-Z0-9_\-\.]+)?",
)

# SQL Server / ADO.NET Connection String password
SQLSERVER_PWD_PATTERN = re.compile(
    r"""(?i)\b(?:password|pwd)\s*=\s*(?P<secret>"[^"\r\n]{3,}"|'[^'\r\n]{3,}'|[^;\r\n]{3,})""",
)
SQLSERVER_CONTEXT_PATTERN = re.compile(
    r"(?i)\b(?:server|data source|initial catalog|database)\s*=",
)

# Config file passwords & secrets
CONFIG_PASSWORD_PATTERN = re.compile(
    r"""(?i)(?<![\w])['"]?(?:[a-z][a-z0-9]{1,24}[_-]){0,3}(?P<label>(?:database|db)[_\s-]*(?:pass(?:word)?|pwd)|password|passwd|pwd|secret[_\s-]*key|client[_\s-]*secret|app[_\s-]*secret)['"]?\s*[:=]\s*(?P<secret>"[^"\r\n]{4,}"|'[^'\r\n]{4,}'|[^\s"';,]{4,})""",
)

# API Keys & Tokens
GITHUB_TOKEN_PATTERN = re.compile(
    r"\b(?P<token>ghp_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{36,}|gho_[a-zA-Z0-9]{36,}|ghs_[a-zA-Z0-9]{36,}|ghr_[a-zA-Z0-9]{36,})\b",
)
AWS_ACCESS_KEY_PATTERN = re.compile(
    r"\b(?P<key>(?:AKIA|ASIA)[0-9A-Z]{16})\b",
)
AWS_SECRET_KEY_PATTERN = re.compile(
    r"(?i)\b(?:aws[_\s-]*secret[_\s-]*access[_\s-]*key|aws[_\s-]*secret|secret[_\s-]*access[_\s-]*key)[\"']?\s*[:=]\s*[\"']?(?P<secret>[a-zA-Z0-9\/+=]{40})[\"']?",
)
GOOGLE_API_KEY_PATTERN = re.compile(
    r"\b(?P<key>AIza[0-9A-Za-z\-_]{30,40})\b",
)
BEARER_TOKEN_PATTERN = re.compile(
    r"(?i)\bBearer\s+(?P<token>[a-zA-Z0-9_@+/=\-\.]{25,})",
)
GENERIC_API_KEY_PATTERN = re.compile(
    r"""(?i)(?<![\w])['"]?(?:[a-z][a-z0-9]{1,24}[_-]){0,3}(?P<label>api[_\s-]*key|apikey|(?:secret|auth|access|refresh)[_\s-]*token|token|account[_\s-]*key|shared[_\s-]*access[_\s-]*key)['"]?\s*[:=]\s*['"]?(?P<secret>[a-zA-Z0-9_./+\-=]{12,})['"]?""",
)

# Private Keys
PRIVATE_KEY_START_PATTERN = re.compile(
    r"-{2,}\s*BEGIN\s+(?:[A-Z0-9_-]+\s+)?PRIVATE\s+KEY\s*-{2,}",
    re.I,
)
PRIVATE_KEY_END_PATTERN = re.compile(
    r"-{2,}\s*END\s+(?:[A-Z0-9_-]+\s+)?PRIVATE\s+KEY\s*-{2,}",
    re.I,
)

# Compact JWT
JWT_PATTERN = re.compile(
    # Tesseract commonly confuses J/I/l and inserts a space after a dot.
    # This is a review heuristic, not cryptographic token validation.
    r"\b(?P<jwt>ey[JIl][a-zA-Z0-9_-]{10,}\s*\.\s*ey[JIl][a-zA-Z0-9_-]{10,}\s*\.\s*[a-zA-Z0-9_-]{10,})\b",
)

# Internal Network Information
IPV4_PRIVATE_PATTERN = re.compile(
    r"\b(?P<ip>(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3})|(?:172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})|(?:192\.168\.\d{1,3}\.\d{1,3}))(?::\d+)?\b",
)
INTERNAL_HOST_PATTERN = re.compile(
    r"\b(?P<host>[a-zA-Z0-9_\-]+\.(?:internal|corp|local|lan|priv))\b",
    re.I,
)


def masked_secret_preview(kind: str, value: str) -> str:
    """Masks secrets so no plaintext credential reaches the frontend."""
    if kind == "db_credential":
        return "pass: [******]"
    if kind == "api_key":
        if value.startswith("AIza"):
            return "AIza***" + value[-4:]
        if value.startswith("ghp_") or value.startswith("github_pat_"):
            return value[:8] + "***" + value[-4:]
        if value.startswith(("AKIA", "ASIA")):
            return value[:4] + "***" + value[-4:]
        return "key: [******]" + (value[-4:] if len(value) >= 8 else "")
    if kind == "private_key":
        return "-----BEGIN PRIVATE KEY----- [******]"
    if kind == "jwt_token":
        parts = value.split(".")
        if len(parts) == 3:
            return f"eyJ***.{parts[1][:4]}***.{parts[2][:4]}***"
        return "eyJ***[JWT]"
    if kind == "internal_ip":
        segments = value.split(".")
        if len(segments) >= 3:
            return f"{segments[0]}.{segments[1]}.***.***"
        return "ip: [internal]"
    if len(value) <= 6:
        return "[******]"
    return value[:2] + "***" + value[-2:]


def _is_valid_ipv4_octets(ip_str: str) -> bool:
    try:
        raw_ip = ip_str.split(":")[0]
        octets = [int(p) for p in raw_ip.split(".")]
        return len(octets) == 4 and all(0 <= o <= 255 for o in octets)
    except (ValueError, IndexError):
        return False


def _assignment_is_documentation(text: str, match: re.Match) -> bool:
    """Exclude explicit placeholders and unquoted colon-led prose.

    This only refines generic assignment rules, not provider key formats. An
    equals assignment or quoted value remains eligible even when letter-only.
    Pattern detection never establishes whether a credential is active.
    """
    value = match.group("secret").strip().strip("\"'")
    if re.fullmatch(
        r"(?i)your[_-](?:(?:api|database|db|access|refresh|client|secret)[_-])*"
        r"(?:password|key|token|secret)[_-]here",
        value,
    ):
        return True
    prefix = text[match.start() : match.start("secret")].rstrip()
    # 'API_KEY: authentication identifies the caller' is a definition, while
    # 'API_KEY=authentication' and 'API_KEY: "authentication"' are values.
    return (
        prefix.endswith(":")
        and value.isalpha()
        and bool(re.match(r"\s+[A-Za-z]+\s+[A-Za-z]+", text[match.end("secret") :]))
    )


def detect_secrets(ocr_result: OCRResult, config: DetectionConfig) -> list[Finding]:
    """Scans OCR text for Developer & Infrastructure secrets."""
    lines = ocr_result.lines or build_lines(ocr_result.blocks)
    findings: list[Finding] = []
    occupied: list[list[tuple[int, int]]] = [[] for _ in lines]
    min_confidence = {"low": 0.60, "balanced": 0.20, "high": 0.0}[config.sensitivity]

    def add_finding(
        line_index: int,
        start: int,
        end: int,
        kind: str,
        label: str,
        risk: str,
        score: float = 0.95,
        source: str = "ocr_regex",
    ) -> None:
        if end <= start or any(start < b and end > a for a, b in occupied[line_index]):
            return
        line = lines[line_index]
        tokens = [
            ocr_result.blocks[span.token_index]
            for span in line.spans
            if span.start < end and span.end > start
        ]
        if not tokens:
            return
        token_len = sum(len(t.text) for t in tokens)
        if token_len == 0:
            return
        avg_confidence = sum(t.confidence * len(t.text) for t in tokens) / token_len
        if avg_confidence < min_confidence:
            if not (risk == "critical" and config.sensitivity != "low"):
                return
            # A recognized credential context is still worth reviewing. Do not
            # inflate OCR confidence to conceal an uncertain reading.
            score = min(score, 0.75)

        left = max(0, min(t.box.x for t in tokens) - 2)
        top = max(0, min(t.box.y for t in tokens) - 2)
        right = min(ocr_result.width, max(t.box.x + t.box.width for t in tokens) + 2)
        bottom = min(ocr_result.height, max(t.box.y + t.box.height for t in tokens) + 2)

        raw_val = line.text[start:end]
        preview = masked_secret_preview(kind, raw_val)

        findings.append(
            Finding(
                id=str(uuid4()),
                type=kind,  # type: ignore[arg-type]
                label=label,
                text="[REDACTED_SECRET]",
                risk=risk,  # type: ignore[arg-type]
                score=score,
                ocr_confidence=round(avg_confidence, 4),
                preview=preview,
                source=source,
                box=BoundingBox(x=left, y=top, width=right - left, height=bottom - top),
            )
        )
        occupied[line_index].append((start, end))

    # 1. Private Keys (scan whole document for multi-line block)
    if getattr(config.types, "private_key", True):
        in_private_key = False
        for idx, line in enumerate(lines):
            if PRIVATE_KEY_START_PATTERN.search(line.text):
                in_private_key = True
                add_finding(
                    idx,
                    0,
                    len(line.text),
                    "private_key",
                    "Khóa bí mật (Private Key Header)",
                    risk="critical",
                    score=0.99,
                )
                continue
            if in_private_key:
                if line.text.strip():
                    add_finding(
                        idx,
                        0,
                        len(line.text),
                        "private_key",
                        "Nội dung Private Key",
                        risk="critical",
                        score=0.98,
                    )
                if PRIVATE_KEY_END_PATTERN.search(line.text):
                    in_private_key = False

    # 2. Line-by-line secret scans
    for idx, line in enumerate(lines):
        text = line.text

        # A. Database Credentials & Passwords
        if getattr(config.types, "db_credential", True):
            for match in DB_URI_PATTERN.finditer(text):
                # Redact only the password or user:pass
                start, end = match.span("secret")
                add_finding(
                    idx,
                    start,
                    end,
                    "db_credential",
                    "Mật khẩu kết nối Database URI",
                    risk="critical",
                    score=0.96,
                )

            # SQL Server password
            if SQLSERVER_CONTEXT_PATTERN.search(text) or any(
                SQLSERVER_CONTEXT_PATTERN.search(lines[j].text)
                for j in (max(0, idx - 1), min(len(lines) - 1, idx + 1))
            ):
                for match in SQLSERVER_PWD_PATTERN.finditer(text):
                    start, end = match.span("secret")
                    add_finding(
                        idx,
                        start,
                        end,
                        "db_credential",
                        "Mật khẩu SQL Server",
                        risk="critical",
                        score=0.95,
                    )

        # Config passwords and application/client secrets share assignment syntax.
        for match in CONFIG_PASSWORD_PATTERN.finditer(text):
            if _assignment_is_documentation(text, match):
                continue
            kind = (
                "api_key"
                if "secret" in match.group("label").lower()
                else "db_credential"
            )
            if not getattr(config.types, kind):
                continue
            start, end = match.span("secret")
            # Do not trigger if secret looks like a placeholder like "null" or "true"
            val = match.group("secret").strip().strip("\"'").lower()
            placeholder = val.translate(str.maketrans({"1": "l", "0": "o"}))
            if placeholder not in {
                "null",
                "true",
                "false",
                "none",
                "undefined",
            } and not re.fullmatch(
                r"nul{2,3}|[*\u2022\u25cf]+|\$\{[^}]+\}|<[^>]+>", placeholder
            ):
                add_finding(
                    idx,
                    start,
                    end,
                    kind,
                    (
                        "Bí mật ứng dụng"
                        if kind == "api_key"
                        else "Mật khẩu trong cấu hình"
                    ),
                    risk="critical",
                    score=0.92,
                )

        # B. Compact JWT
        if getattr(config.types, "jwt_token", True):
            for match in JWT_PATTERN.finditer(text):
                token_str = match.group("jwt")
                parts = token_str.split(".")
                if len(parts) == 3 and len(parts[0]) >= 10 and len(parts[1]) >= 10:
                    add_finding(
                        idx,
                        *match.span("jwt"),
                        "jwt_token",
                        "JSON Web Token (JWT)",
                        risk="critical",
                        score=0.92,
                    )

        # C. API Keys & Cloud Credentials
        if getattr(config.types, "api_key", True):
            # GitHub Token
            for match in GITHUB_TOKEN_PATTERN.finditer(text):
                add_finding(
                    idx,
                    *match.span(),
                    "api_key",
                    "GitHub Access Token",
                    risk="critical",
                    score=0.98,
                )

            # AWS Access Key ID (HIGH, distinct from Secret Access Key)
            for match in AWS_ACCESS_KEY_PATTERN.finditer(text):
                add_finding(
                    idx,
                    *match.span(),
                    "api_key",
                    "AWS Access Key ID",
                    risk="high",
                    score=0.95,
                )

            # AWS Secret Access Key (CRITICAL)
            for match in AWS_SECRET_KEY_PATTERN.finditer(text):
                start, end = match.span("secret")
                add_finding(
                    idx,
                    start,
                    end,
                    "api_key",
                    "AWS Secret Access Key",
                    risk="critical",
                    score=0.97,
                )

            # Google API Key
            for match in GOOGLE_API_KEY_PATTERN.finditer(text):
                add_finding(
                    idx,
                    *match.span(),
                    "api_key",
                    "Google API Key",
                    risk="critical",
                    score=0.96,
                )

            # Bearer Token
            for match in BEARER_TOKEN_PATTERN.finditer(text):
                start, end = match.span("token")
                add_finding(
                    idx,
                    start,
                    end,
                    "api_key",
                    "Bearer Authentication Token",
                    risk="critical",
                    score=0.94,
                )

            # Generic API Key
            for match in GENERIC_API_KEY_PATTERN.finditer(text):
                if _assignment_is_documentation(text, match):
                    continue
                start, end = match.span("secret")
                add_finding(
                    idx,
                    start,
                    end,
                    "api_key",
                    "API Key bí mật",
                    risk="critical",
                    score=0.90,
                )

        # D. Internal Network IP & Hostnames
        # Note: IP alone is LOW/MEDIUM risk, NEVER default CRITICAL.
        if config.profile == "security" and getattr(config.types, "internal_ip", True):
            for match in IPV4_PRIVATE_PATTERN.finditer(text):
                ip_val = match.group("ip")
                if _is_valid_ipv4_octets(ip_val):
                    add_finding(
                        idx,
                        *match.span("ip"),
                        "internal_ip",
                        "Địa chỉ IP nội bộ",
                        risk="low",
                        score=0.85,
                    )

            for match in INTERNAL_HOST_PATTERN.finditer(text):
                add_finding(
                    idx,
                    *match.span("host"),
                    "internal_ip",
                    "Hostname mạng nội bộ",
                    risk="low",
                    score=0.82,
                )

    return sorted(findings, key=lambda f: (f.box.y, f.box.x))
