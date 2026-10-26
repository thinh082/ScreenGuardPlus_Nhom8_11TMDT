"""Real Tesseract tests. Never replace extract_text/image_to_data with fixtures here."""
from io import BytesIO
import json
import shutil
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
import pytest

from backend.main import app
from core.models import DetectionConfig, CustomRule
from core.ocr import extract_text, get_ocr_status, find_tesseract, tessdata_directory
from core.pipeline import run_pipeline

DATA=Path(__file__).resolve().parents[1]/"sample_data/screenshots"
pytestmark=pytest.mark.skipif(not get_ocr_status()["ocr_available"],reason="Tesseract with eng/vie is not installed; real OCR integration was not run.")


@pytest.mark.parametrize("name,expected",[("email",{"EMAIL"}),("phone",{"PHONE"}),("student",{"STUDENT_ID"}),
    ("citizen",{"CITIZEN_ID"}),("bank",{"BANK_ACCOUNT"}),("all",{"EMAIL","PHONE","STUDENT_ID","CITIZEN_ID","BANK_ACCOUNT"}),
    ("clean",set()),("split",{"EMAIL","PHONE"})])
def test_real_screenshots_TC01_to_TC07(name,expected):
    payload=(DATA/f"{name}.png").read_bytes()
    response=TestClient(app).post("/api/scan",files={"image":("screenshot.png",payload,"image/png")},data={"config":DetectionConfig(language="eng").model_dump_json()})
    assert response.status_code==200, response.json()
    result=response.json()
    assert result["mode"]=="real_ocr" and {f["type"] for f in result["findings"]}==expected
    assert len(result["findings"])==len(expected)
    assert all("text" not in f for f in result["findings"])
    expected_boxes=json.loads((DATA/"expected.json").read_text(encoding="utf-8"))[name]["value_boxes"]
    for finding in result["findings"]:
        x,y,right,bottom=finding["bbox"]
        assert 0<=x<right<=result["width"] and 0<=y<bottom<=result["height"]
        assert x>350  # labels in the left column are not included
        assert any(abs(y-box[1])<8 and right>=box[2]-6 for box in expected_boxes)
        assert 0<=finding["ocr_confidence"]<=1


def test_real_toggle_and_custom_TC08_TC09():
    config=DetectionConfig(language="eng")
    config.types.email=False
    result=run_pipeline((DATA/"all.png").read_bytes(),config,"image/png")
    assert len(result.findings)==4 and all(f.type!="EMAIL" for f in result.findings)
    config.rules=[CustomRule(id="1",name="Staff",kind="regex",pattern=r"NV-\d{6}"),CustomRule(id="2",name="Secret",kind="keyword",pattern="CONFIDENTIAL")]
    result=run_pipeline((DATA/"custom.png").read_bytes(),config,"image/png")
    assert len(result.findings)==2 and all(f.type=="CUSTOM" for f in result.findings)


def test_real_vietnamese_language_pack():
    if "vie" not in get_ocr_status()["languages"]:
        pytest.skip("Vietnamese pack not installed; English fallback is unit-tested.")
    result=run_pipeline((DATA/"vietnamese.png").read_bytes(),DetectionConfig(),"image/png")
    assert {f.type for f in result.findings}=={"CITIZEN_ID","BANK_ACCOUNT","STUDENT_ID"}


def test_exif_orientation_matches_browser_and_preserves_boxes():
    # Store pixels rotated left; EXIF orientation 6 turns them back to the visible screenshot.
    with Image.open(DATA/"all.png") as upright:
        rotated=upright.transpose(Image.Transpose.ROTATE_90)
        exif=Image.Exif();exif[274]=6
        output=BytesIO();rotated.save(output,format="JPEG",quality=98,exif=exif)
        result=extract_text(output.getvalue(),"eng")
        assert (result.width,result.height)==upright.size
        assert "test.screenguard@example.com" in result.text
        assert all(block.box.x+block.box.width<=result.width for block in result.blocks)


def test_actual_english_fallback_with_vietnamese_pack_absent(tmp_path,monkeypatch):
    directory=Path(tessdata_directory() or Path(find_tesseract()).parent/"tessdata")
    if not (directory/"eng.traineddata").is_file():
        pytest.skip("English traineddata path unavailable for fallback test.")
    isolated=tmp_path/"language data with spaces"
    isolated.mkdir()
    shutil.copyfile(directory/"eng.traineddata",isolated/"eng.traineddata")
    monkeypatch.setenv("TESSDATA_PREFIX",str(isolated))
    result=run_pipeline((DATA/"email.png").read_bytes(),DetectionConfig(),"image/png")
    assert result.language=="eng" and result.findings[0].type=="EMAIL"
    assert result.warnings and "vie" in result.warnings[0]


def test_engine_missing_and_timeout_return_safe_errors(monkeypatch):
    client=TestClient(app)
    def upload():
        return client.post("/api/scan",files={"image":("all.png",(DATA/"all.png").read_bytes(),"image/png")},data={"config":DetectionConfig().model_dump_json()})
    with monkeypatch.context() as patch:
        patch.setenv("TESSERACT_CMD","missing-screenguard-tesseract-binary")
        response=upload()
        assert response.status_code==503 and response.json()["detail"]["code"]=="OCR_UNAVAILABLE"
    monkeypatch.setattr("core.ocr.OCR_TIMEOUT",.0001)
    response=upload()
    assert response.status_code==504 and response.json()["detail"]["code"]=="OCR_FAILED"
    assert "test.screenguard" not in response.text and "Traceback" not in response.text
