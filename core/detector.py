"""Regex/context heuristics with character-span → OCR-token → pixel mapping."""
import re
import time
import unicodedata
from uuid import uuid4

import regex

from core.models import BoundingBox, DetectionConfig, Finding, OCRResult
from core.ocr import build_lines
from core.rules import RuleValidationError, compile_pattern, validate_rules

EMAIL = re.compile(r"(?<![\w.+-])[A-Z0-9_+%-]+(?:\s*\.\s*[A-Z0-9_+%-]+)*\s*@\s*[A-Z0-9-]+(?:\s*\.\s*[A-Z0-9-]+)*\s*\.\s*[A-Z]{2,63}(?![\w.-])", re.I)
NUMBER = re.compile(r"(?<![\w+])\+?\d(?:[ .-]*\d){5,18}(?![ .-]*\d)(?!\w)")
PHONE = re.compile(r"(?:0|\+?84)[35789]\d{8}\Z")
STUDENT = re.compile(r"\bSV[ .-]?\d{6,12}\b", re.I)
IDENTIFIER = re.compile(r"\b[A-Z0-9][A-Z0-9._-]{4,19}\b", re.I)
CONTEXTS = {
    "cccd": re.compile(r"\b(?:cccd|can cuoc(?: cong dan)?|citizen\s*id)\b"),
    "bank": re.compile(r"\b(?:stk|so tai khoan|bank account|account (?:number|no))\b"),
    "student": re.compile(r"\b(?:mssv|ma (?:so )?sinh vien|student\s*id)\b"),
    "phone": re.compile(r"\b(?:sdt|so dien thoai|dien thoai|phone|telephone)\b"),
}
LABELS = {"email": "Địa chỉ email", "phone": "Số điện thoại", "student": "Mã số sinh viên",
          "cccd": "Căn cước công dân", "bank": "Tài khoản ngân hàng"}
MAX_FINDINGS = 500
CUSTOM_RULE_SECONDS = 0.05
CUSTOM_TOTAL_SECONDS = 0.5


def folded(text: str) -> str:
    return "".join(char for char in unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
                   if not unicodedata.combining(char))


def masked_preview(value: str, kind: str) -> str:
    if kind == "email":
        local, domain = value.split("@", 1)
        return local[:2] + "***@" + domain
    if len(value) <= 4:
        return "***"
    return value[:2] + "***" + value[-2:]


def nearest_context(text: str, start: int, end: int) -> str | None:
    prefix = folded(text[:start])
    candidates = [(len(prefix) - match.end(), 0, kind) for kind, pattern in CONTEXTS.items()
                  for match in pattern.finditer(prefix) if len(prefix) - match.end() <= 64
                  and not re.search(r"\d", prefix[match.end():])]
    suffix = folded(text[end:])
    candidates += [(match.start(), 1, kind) for kind, pattern in CONTEXTS.items()
                  for match in pattern.finditer(suffix) if match.start() <= 20
                  and not re.search(r"\d", suffix[:match.start()])
                  and not re.match(r"\s*[:=]\s*\S", suffix[match.end():])]
    return min(candidates)[2] if candidates else None


def detect_sensitive_text(ocr_result: OCRResult, rules: DetectionConfig) -> list[Finding]:
    validate_rules(rules)
    lines = ocr_result.lines or build_lines(ocr_result.blocks)
    findings = []
    occupied = [[] for _ in lines]
    min_confidence = {"low": .60, "balanced": .20, "high": 0}[rules.sensitivity]

    def add(line_index, start, end, kind, score, label=None, risk="high", source="ocr_regex"):
        if end <= start or any(start < b and end > a for a, b in occupied[line_index]):
            return
        line = lines[line_index]
        tokens = [ocr_result.blocks[span.token_index] for span in line.spans if span.start < end and span.end > start]
        if not tokens:
            return
        confidence = sum(token.confidence * len(token.text) for token in tokens) / sum(len(token.text) for token in tokens)
        if confidence < min_confidence:
            return
        left = max(0, min(token.box.x for token in tokens) - 2)
        top = max(0, min(token.box.y for token in tokens) - 2)
        right = min(ocr_result.width, max(token.box.x + token.box.width for token in tokens) + 2)
        bottom = min(ocr_result.height, max(token.box.y + token.box.height for token in tokens) + 2)
        value = line.text[start:end]
        if kind in {"email", "phone", "cccd", "bank", "student"}:
            value = re.sub(r"\s+", "", value)
        findings.append(Finding(id=str(uuid4()), type=kind, label=label or LABELS[kind], text=value,
                                risk=risk, score=score, ocr_confidence=round(confidence, 4),
                                preview=masked_preview(value, kind), source=source,
                                box=BoundingBox(x=left, y=top, width=right-left, height=bottom-top)))
        occupied[line_index].append((start, end))
        if len(findings) > MAX_FINDINGS:
            raise RuleValidationError("Có quá nhiều vùng phát hiện. Hãy kiểm tra ảnh theo từng phần nhỏ hơn.")

    def context_for(index, start, end):
        context = nearest_context(lines[index].text, start, end)
        if context or index == 0:
            return context
        previous = lines[index-1]
        # Support a label on the preceding line only when that line contains just the label.
        normalized = folded(previous.text).strip(" :.-")
        labels = [kind for kind, pattern in CONTEXTS.items() if pattern.fullmatch(normalized)]
        if labels and previous.spans and lines[index].spans:
            prior = ocr_result.blocks[previous.spans[-1].token_index].box
            current = ocr_result.blocks[lines[index].spans[0].token_index].box
            if 0 <= current.y - (prior.y + prior.height) <= prior.height * 2.5 and abs(current.x-prior.x) < 300:
                return labels[0]
        return None

    for index, line in enumerate(lines):
        if rules.types.email:
            for match in EMAIL.finditer(line.text):
                add(index, *match.span(), "email", .95)
        if rules.types.student:
            for match in STUDENT.finditer(line.text):
                add(index, *match.span(), "student", .90, risk="medium")
            for match in IDENTIFIER.finditer(line.text):
                if re.search(r"\d", match[0]) and context_for(index, *match.span()) == "student":
                    add(index, *match.span(), "student", .92, risk="medium")
        for match in NUMBER.finditer(line.text):
            value = re.sub(r"[ .-]", "", match[0])
            digits = value.lstrip("+")
            context = context_for(index, *match.span())
            kind = None
            if context == "cccd" and len(digits) == 12:
                kind = "cccd"
            elif context == "bank" and 8 <= len(digits) <= 19:
                kind = "bank"
            elif context == "student" and 6 <= len(digits) <= 14:
                kind = "student"
            elif context in {None, "phone"} and PHONE.fullmatch(value):
                kind = "phone"
            # A disabled contextual category must never be relabeled as another category.
            if kind and getattr(rules.types, kind):
                add(index, *match.span(), kind, .93 if context else .88,
                    risk="medium" if kind in {"phone", "student"} else "high")

    if rules.types.custom:
        total_deadline = time.monotonic() + CUSTOM_TOTAL_SECONDS
        for rule_index, rule in enumerate(rules.rules, 1):
            if not rule.enabled:
                continue
            pattern = compile_pattern(rule.pattern) if rule.kind == "regex" else regex.compile(
                r"\s+".join(regex.escape(part) for part in rule.pattern.split()), regex.IGNORECASE)
            deadline = min(total_deadline, time.monotonic() + CUSTOM_RULE_SECONDS)
            try:
                for index, line in enumerate(lines):
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError
                    for match in pattern.finditer(line.text, timeout=remaining):
                        add(index, *match.span(), "custom", .80, label=rule.name, risk=rule.risk,
                            source="ocr_keyword" if rule.kind == "keyword" else "ocr_regex")
            except TimeoutError as exc:
                raise RuleValidationError(f"Quy tắc {rule_index} vượt thời gian xử lý. Hãy đơn giản hóa Regex hoặc giảm số quy tắc.") from exc
    return sorted(findings, key=lambda finding: (finding.box.y, finding.box.x))
