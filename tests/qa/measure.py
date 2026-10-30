"""python -m tests.qa.measure --output test-results/pre-demo/baseline.json

Only authored synthetic data is processed. Never discovers user screenshots.
Full pipeline latency is measured once per image; diagnostic OCR is excluded.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import statistics
import subprocess
import time

from core.models import BoundingBox, DetectionConfig, OCRBlock, OCRResult
from core.ocr import build_lines, extract_text, get_ocr_status
from core.pipeline import TYPE_MAP, run_pipeline
from core.secrets_detector import detect_secrets
from core.detector import detect_sensitive_text
from tests.qa.corpus import CASES, render


def oracle(case, boxes):
    blocks = []
    for index, (text, box) in enumerate(zip(case.lines, boxes)):
        x, y, right, bottom = box
        blocks.append(
            OCRBlock(
                text=text,
                box=BoundingBox(
                    x=x, y=y, width=max(1, right - x), height=max(1, bottom - y)
                ),
                confidence=1,
                line_id=(1, 1, 1, index + 1),
            )
        )
    return OCRResult(
        width=max([b.box.x + b.box.width for b in blocks] + [1200]),
        height=max([b.box.y + b.box.height for b in blocks] + [300]),
        language="eng",
        blocks=blocks,
        lines=build_lines(blocks),
    )


def matched_counts(expected, actual, boxes):
    """Entity-level one-to-one matching: same type and overlap with authored line."""
    remaining = list(expected)
    tp = fp = 0
    for finding in actual:
        x, y, r, b = finding.bbox
        match = next(
            (
                i
                for i, (line, kind) in enumerate(remaining)
                if kind == finding.type
                and min(r, boxes[line][2]) > max(x, boxes[line][0])
                and min(b, boxes[line][3]) > max(y, boxes[line][1])
            ),
            None,
        )
        if match is None:
            fp += 1
        else:
            tp += 1
            remaining.pop(match)
    return {"tp": tp, "fp": fp, "fn": len(remaining)}


def measure(output, language="eng"):
    config = DetectionConfig(language=language)
    rows = []
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    for case in CASES:
        image, boxes = render(case)
        (target.parent / f"{case.id}.png").write_bytes(image)
        started = time.perf_counter()
        result = run_pipeline(image, config, "image/png")
        elapsed = time.perf_counter() - started
        ocr = extract_text(image, language)
        truth_ocr = oracle(case, boxes)
        ideal = detect_sensitive_text(truth_ocr, config) + detect_secrets(
            truth_ocr, config
        )
        counts = matched_counts(case.expected, result.findings, boxes)
        expected = Counter(kind for _, kind in case.expected)
        observed = Counter(f.type for f in result.findings)
        ideal_types = Counter(TYPE_MAP[f.type] for f in ideal)
        rows.append(
            {
                "id": case.id,
                "tc": case.tc,
                "source": "authored_synthetic",
                "stress": case.stress,
                "image_sha256": hashlib.sha256(image).hexdigest(),
                "expected": dict(expected),
                "actual": dict(observed),
                "counts": counts,
                "latency_ms": round(elapsed * 1000, 2),
                "oracle_detector_types": dict(ideal_types),
                "miss_attribution": (
                    "detector"
                    if counts["fn"]
                    and any(ideal_types[k] < v for k, v in expected.items())
                    else "ocr_or_geometry" if counts["fn"] else None
                ),
                "synthetic_ocr_text": ocr.text,
                "findings": [
                    {
                        "type": f.type,
                        "label": f.label,
                        "bbox": f.bbox,
                        "risk": f.risk,
                        "score": f.score,
                        "ocr_confidence": f.ocr_confidence,
                        "preview": f.preview,
                    }
                    for f in result.findings
                ],
            }
        )
    groups = {}
    for name, subset in [
        ("all", rows),
        ("clear", [r for r in rows if not r["stress"]]),
        ("stress", [r for r in rows if r["stress"]]),
    ]:
        totals = {k: sum(r["counts"][k] for r in subset) for k in ["tp", "fp", "fn"]}
        tp, fp, fn = (totals[k] for k in ["tp", "fp", "fn"])
        precision = tp / (tp + fp) if tp + fp else None
        recall = tp / (tp + fn) if tp + fn else None
        f1 = 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None
        latencies = sorted(r["latency_ms"] for r in subset)
        groups[name] = {
            "images": len(subset),
            **totals,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "negative_images": sum(not r["expected"] for r in subset),
            "negative_images_alerted": sum(
                not r["expected"] and bool(r["actual"]) for r in subset
            ),
            "median_ms": statistics.median(latencies),
            "max_ms": max(latencies),
        }
    report = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "git_head": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True
        ).strip(),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "ocr": get_ocr_status(),
        "language": language,
        "profile": "personal",
        "runs_per_image": 1,
        "latency_includes": "validation + Tesseract + PII/secrets + policy + ticket; diagnostic OCR excluded; sequential; no warmup",
        "matching": "one-to-one type and intersection with authored line; recall includes OCR failures",
        "scope": "small authored synthetic corpus; not a representative production accuracy estimate",
        "metrics": groups,
        "cases": rows,
    }
    target.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "output": str(target),
                "metrics": groups,
                "false_positive_cases": [r["id"] for r in rows if r["counts"]["fp"]],
            }
        )
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--language", choices=["eng", "vie+eng"], default="eng")
    args = parser.parse_args()
    measure(args.output, args.language)
