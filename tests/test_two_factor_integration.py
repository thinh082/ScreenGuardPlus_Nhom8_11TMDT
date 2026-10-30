"""Real Tesseract and Windows file events for a fictitious 2FA shared secret."""
from io import BytesIO
import json
from pathlib import Path
import time

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont
import pytest

from backend.main import create_app
from core.models import DetectionConfig
from core.ocr import extract_text, get_ocr_status
from core.secrets_detector import detect_secrets
from desktop_agent.controller import Companion
from desktop_agent.settings import AgentSettings, save_settings
from tests.test_secrets_detector import fake_ocr

FAKE_SEED = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"


def image(text, size=22):
    candidates = [Path('C:/Windows/Fonts/consola.ttf'),Path('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf')]
    face = next((str(p) for p in candidates if p.is_file()),None)
    if not face: pytest.skip('Scalable test font unavailable')
    font=ImageFont.truetype(face,size)
    canvas=Image.new('RGB',(max(1000,int(font.getlength(text))+70),160),'white')
    ImageDraw.Draw(canvas).text((30,50),text,font=font,fill='#12314d')
    output=BytesIO();canvas.save(output,format='PNG');return output.getvalue()


@pytest.mark.parametrize('label',['2FA','2 FA','TOTP_SECRET=','OTP key:','Authenticator key:','Two factor:'])
def test_explicit_two_factor_labels(label):
    findings=detect_secrets(fake_ocr(label+' '+FAKE_SEED),DetectionConfig())
    assert len(findings)==1 and findings[0].type=='api_key'
    assert findings[0].risk=='critical'
    assert FAKE_SEED not in findings[0].model_dump_json()


@pytest.mark.parametrize('text',[
    '2FA authentication mechanisms protect the account.',
    '2FA is enabled for this account.', '2FA disabled', 'OTP 123456',
    '2FA ........', 'Pass ********', 'Pass through the tunnel',
    'PA documentationexamplesarenotsecrets',
    'FA documentationexamplesarenotsecrets',
    'The random word '+FAKE_SEED,
])
def test_two_factor_context_does_not_invent_values(text):
    assert detect_secrets(fake_ocr(text),DetectionConfig())==[]


@pytest.mark.skipif(not get_ocr_status()['ocr_available'],reason='Real Tesseract unavailable')
def test_real_two_factor_api_masking_toggle_and_original_coordinates():
    payload=image('2FA '+FAKE_SEED)
    with TestClient(create_app()) as client:
        config=DetectionConfig(language='eng')
        result=client.post('/api/scan',files={'image':('arbitrary.png',payload,'image/png')},data={'config':config.model_dump_json()})
        assert result.status_code==200
        data=result.json();assert len(data['findings'])==1
        finding=data['findings'][0]
        assert finding['type']=='API_KEY' and finding['risk']=='CRITICAL'
        assert '2FA' in finding['label'] and FAKE_SEED not in result.text
        with Image.open(BytesIO(payload)) as source: assert source.size==(data['width'],data['height'])
        x,y,right,bottom=finding['bbox'];assert 0<=x<right<=data['width'] and 0<=y<bottom<=data['height']
        assert 35<=y<=80 and 60<=bottom<=110  # returned in original, not doubled coordinates
        config.types.api_key=False
        disabled=client.post('/api/scan',files={'image':('arbitrary.png',payload,'image/png')},data={'config':config.model_dump_json()})
        assert disabled.status_code==200 and disabled.json()['findings']==[]


@pytest.mark.skipif(not get_ocr_status()['ocr_available'],reason='Real Tesseract unavailable')
def test_two_factor_new_file_produces_agent_alert_and_block(tmp_path,caplog):
    folder=tmp_path/'Screenshots';folder.mkdir()
    settings=AgentSettings(folder=str(folder),enabled=True,popup_enabled=False)
    settings.config.language='eng'
    path=tmp_path/'settings.json';save_settings(path,settings)
    class Recorder:
        last_status='not_sent'
        def __init__(self):self.items=[]
        def notify(self,count,key):self.items.append((count,key));self.last_status='submitted'
        def clear(self):pass
    notifier=Recorder();agent=Companion('http://127.0.0.1:8057',path=path,notifier=notifier)
    try:
        agent.start();assert agent.status()['running']
        (folder/'new.png').write_bytes(image('2FA '+FAKE_SEED))
        deadline=time.monotonic()+12
        while not notifier.items and time.monotonic()<deadline:time.sleep(.05)
        assert len(notifier.items)==1 and notifier.items[0][0]==1
        review=agent.reviews.get(notifier.items[0][1])
        assert review.result.findings[0].type=='API_KEY'
        assert review.result.policy_decision=='BLOCK'
        assert FAKE_SEED not in json.dumps(notifier.items)+caplog.text+review.result.model_dump_json()
    finally:agent.close()
