from core.models import BoundingBox, DetectionConfig, OCRBlock, OCRResult
from core.ocr import build_lines
from core.secrets_detector import detect_secrets


def sample():
    blocks = [
        OCRBlock(text="API Key:", box=BoundingBox(x=20, y=95, width=100, height=40), confidence=.9, line_id=(1, 1, 1, 1)),
        OCRBlock(text="sk-ab12cd34ef56", box=BoundingBox(x=150, y=80, width=200, height=45), confidence=.9, line_id=(1, 1, 1, 2)),
        OCRBlock(text="gh78ij90kl12mn34", box=BoundingBox(x=155, y=115, width=200, height=45), confidence=.9, line_id=(1, 1, 1, 3)),
        OCRBlock(text="0901878896", box=BoundingBox(x=155, y=200, width=200, height=45), confidence=.9, line_id=(1, 1, 1, 4)),
    ]
    return OCRResult(width=500, height=300, language="eng", blocks=blocks, lines=build_lines(blocks))


def test_label_and_wrapped_key_cover_both_lines():
    result = detect_secrets(sample(), DetectionConfig())
    assert len(result) == 1 and result[0].type == "api_key"
    box = result[0].box
    assert box.x <= 150 and box.y <= 80
    assert box.x + box.width >= 355 and box.y + box.height >= 160
    assert box.y + box.height < 200
    assert result[0].preview == "key: [******]"


def test_disabled_and_missing_label_do_not_trigger():
    config = DetectionConfig()
    config.types.api_key = False
    assert not detect_secrets(sample(), config)
    result = sample()
    result.blocks[0].text = "Reference:"
    result.lines = build_lines(result.blocks)
    assert not detect_secrets(result, DetectionConfig())
