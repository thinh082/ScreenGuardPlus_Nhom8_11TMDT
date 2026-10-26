import pytest

from core.detector import detect_sensitive_text
from core.models import BoundingBox, CustomRule, DetectionConfig, OCRBlock, OCRResult
from core.ocr import build_lines, choose_language, OCRUnavailableError
from core.rules import RuleValidationError, compile_pattern


def ocr(*lines, confidence=.95):
    blocks=[]
    for row, line in enumerate(lines):
        x=20
        for word in line.split():
            blocks.append(OCRBlock(text=word,box=BoundingBox(x=x,y=20+row*40,width=len(word)*10,height=20),
                                   confidence=confidence,line_id=(1,1,1,row+1)))
            x+=len(word)*10+10
    return OCRResult(width=max(2000,x+10),height=max(200,40*len(lines)+20),language="eng",blocks=blocks,lines=build_lines(blocks))


@pytest.mark.parametrize("line,kind",[
    ("Email: test.screenguard@example.com","email"),
    ("Email: test . screenguard @ example . com","email"),
    ("0900000000","phone"),("+84900000000","phone"),("090 000 0000","phone"),("090.000.0000","phone"),("090-000-0000","phone"),
    ("SV20260001","student"),("MSSV: 20260001","student"),("Mã sinh viên: 22DH12345","student"),
    ("CCCD: 000000000000","cccd"),("Căn cước công dân: 000 000 000 000","cccd"),
    ("STK: 111111111111","bank"),("Số tài khoản: 0900000000","bank"),
])
def test_types_and_context(line,kind):
    findings=detect_sensitive_text(ocr(line),DetectionConfig())
    assert len(findings)==1 and findings[0].type==kind
    assert 0<=findings[0].score<=1 and findings[0].ocr_confidence==.95
    assert findings[0].text not in findings[0].preview


def test_multi_token_box_covers_complete_value_but_excludes_label():
    result=ocr("Email: test . screenguard @ example . com")
    finding=detect_sensitive_text(result,DetectionConfig())[0]
    assert finding.box.x==result.blocks[1].box.x-2
    assert finding.box.x>result.blocks[0].box.x+result.blocks[0].box.width
    assert finding.box.x+finding.box.width>=result.blocks[-1].box.x+result.blocks[-1].box.width
    assert finding.text=="test.screenguard@example.com"


def test_context_priority_dedup_and_disabled_type_do_not_relabel():
    result=ocr("CCCD: 000000000000 STK: 111111111111 Phone: 0900000000")
    config=DetectionConfig()
    assert [f.type for f in detect_sensitive_text(result,config)]==["cccd","bank","phone"]
    config.types.bank=False
    assert detect_sensitive_text(ocr("STK: 0900000000"),config)==[]
    for field in ("email","phone","student","cccd","bank"):
        setattr(config.types,field,False)
    assert detect_sensitive_text(result,config)==[]


def test_nearest_trailing_context_and_next_label_are_distinguished():
    result=ocr("111111111111 (STK)", "CCCD: 000000000000 STK: 111111111111")
    assert [f.type for f in detect_sensitive_text(result,DetectionConfig())]==["bank","cccd","bank"]


def test_numbers_without_context_are_not_ids_or_bank_accounts():
    assert detect_sensitive_text(ocr("Order: 123456789012","Reference: 111111111111","Total: 20260001"),DetectionConfig())==[]


def test_label_on_previous_line_and_confidence_sensitivity():
    assert detect_sensitive_text(ocr("Citizen ID:","000000000000"),DetectionConfig())[0].type=="cccd"
    result=ocr("Email: sample@example.com",confidence=.4)
    config=DetectionConfig(sensitivity="low")
    assert detect_sensitive_text(result,config)==[]
    config.sensitivity="balanced"
    assert len(detect_sensitive_text(result,config))==1


def test_custom_keyword_regex_switches_and_overlap():
    config=DetectionConfig(rules=[CustomRule(id="1",name="Internal",kind="keyword",pattern="CONFIDENTIAL"),CustomRule(id="2",name="Staff",kind="regex",pattern=r"NV-\d{6}")])
    result=ocr("Classification: CONFIDENTIAL","Staff: NV-246810")
    assert {f.label for f in detect_sensitive_text(result,config)}=={"Internal","Staff"}
    config.rules[0].enabled=False
    assert len(detect_sensitive_text(result,config))==1
    config.types.custom=False
    assert detect_sensitive_text(result,config)==[]
    config=DetectionConfig(rules=[CustomRule(id="1",name="Email duplicate",kind="keyword",pattern="test@example.com")])
    assert len(detect_sensitive_text(ocr("Email: test@example.com"),config))==1


@pytest.mark.parametrize("pattern",["[",r"a{100000000}",r"(?R)",r"(a)\1",r"(?=secret)","("*13+"a"+")"*13])
def test_invalid_or_complex_regex_rejected(pattern):
    with pytest.raises(RuleValidationError):
        compile_pattern(pattern)


def test_pathological_regex_times_out_without_hanging():
    config=DetectionConfig(rules=[CustomRule(id="1",name="Slow",kind="regex",pattern="(a+)+$")])
    with pytest.raises(RuleValidationError,match="vượt thời gian"):
        detect_sensitive_text(ocr("a"*20_000+"!"),config)


def test_language_fallback_and_missing_engine_data():
    language,warnings=choose_language("vie+eng",["eng"])
    assert language=="eng" and warnings and "vie" in warnings[0]
    assert choose_language("vie",["eng"])[0]=="eng"
    with pytest.raises(OCRUnavailableError):
        choose_language("vie+eng",[])
