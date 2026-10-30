"""Bounded custom rules. No evaluation of arbitrary code."""
import re
import regex


class RuleValidationError(ValueError):
    pass


def compile_pattern(pattern: str):
    if not pattern.strip() or len(pattern) > 200:
        raise RuleValidationError("Regex phải có từ 1 đến 200 ký tự.")
    # Shared JS/Python subset: no recursion, lookaround, flags or backreferences.
    if re.search(r"\(\?(?!:)|\\(?:[1-9]|g[<{]|k[<{])", pattern):
        raise RuleValidationError("Regex không hỗ trợ lookaround, backreference hoặc nhóm mở rộng.")
    if pattern.count("(") > 12 or pattern.count("|") > 12 or len(re.findall(r"(?<!\\)[*+?{]", pattern)) > 20:
        raise RuleValidationError("Regex quá phức tạp (tối đa 12 nhóm/nhánh và 20 toán tử lặp).")
    for bound in re.findall(r"\{(\d+(?:,\d*)?)\}", pattern):
        if any(int(n) > 1000 for n in bound.split(",") if n):
            raise RuleValidationError("Giới hạn lặp trong Regex không được vượt quá 1000.")
    try:
        return regex.compile(pattern, regex.IGNORECASE | regex.VERSION0)
    except (regex.error, OverflowError, RuntimeError) as exc:
        raise RuleValidationError("Biểu thức Regex không hợp lệ.") from exc


def validate_rules(config):
    ids = set()
    for index, rule in enumerate(config.rules, 1):
        if rule.id in ids or not rule.name.strip() or not rule.pattern.strip():
            raise RuleValidationError(f"Quy tắc {index}: tên/mẫu rỗng hoặc ID trùng.")
        ids.add(rule.id)
        if rule.kind == "regex":
            try:
                compile_pattern(rule.pattern)
            except RuleValidationError as exc:
                raise RuleValidationError(f"Quy tắc {index}: {exc}") from exc
