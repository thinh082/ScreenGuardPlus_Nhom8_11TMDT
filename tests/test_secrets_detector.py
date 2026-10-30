import pytest

from core.models import BoundingBox, DetectionConfig, OCRBlock, OCRResult
from core.ocr import build_lines
from core.secrets_detector import detect_secrets, masked_secret_preview


def fake_ocr(*lines, confidence=0.95):
    blocks = []
    for row, line in enumerate(lines):
        x = 20
        for word in line.split():
            blocks.append(
                OCRBlock(
                    text=word,
                    box=BoundingBox(
                        x=x, y=20 + row * 40, width=len(word) * 10, height=20
                    ),
                    confidence=confidence,
                    line_id=(1, 1, 1, row + 1),
                )
            )
            x += len(word) * 10 + 10
    return OCRResult(
        width=max(2000, x + 10),
        height=max(200, 40 * len(lines) + 20),
        language="eng",
        blocks=blocks,
        lines=build_lines(blocks),
    )


def test_TC01_db_connection_strings_and_credentials():
    # PostgreSQL URI
    result = fake_ocr(
        "Database: postgresql://admin:SuperSecretPass123@db.example.com:5432/production"
    )
    findings = detect_secrets(result, DetectionConfig(profile="security"))
    assert len(findings) == 1
    assert findings[0].type == "db_credential"
    assert findings[0].risk == "critical"
    assert "SuperSecretPass123" not in findings[0].preview
    assert findings[0].preview == "pass: [******]"

    # If URI also has internal hostname, both are detected appropriately
    res_both = fake_ocr(
        "Database: postgresql://admin:SuperSecretPass123@db.internal.corp:5432/production"
    )
    find_both = detect_secrets(res_both, DetectionConfig(profile="security"))
    assert any(f.type == "db_credential" and f.risk == "critical" for f in find_both)
    assert any(f.type == "internal_ip" and f.risk == "low" for f in find_both)

    # SQL Server Password
    result_sql = fake_ocr(
        "Server=10.0.0.15;Database=Orders;User Id=sa;Password=MySecretSqlPass99;"
    )
    findings_sql = detect_secrets(result_sql, DetectionConfig(profile="security"))
    assert any(f.type == "db_credential" and f.risk == "critical" for f in findings_sql)

    # Config password
    result_cfg = fake_ocr("db_password = 'HardcodedPassword2026'")
    findings_cfg = detect_secrets(result_cfg, DetectionConfig(profile="security"))
    assert len(findings_cfg) == 1
    assert findings_cfg[0].type == "db_credential"
    assert findings_cfg[0].risk == "critical"


def test_TC02_api_keys_and_distinguish_access_vs_secret():
    # GitHub PAT
    result = fake_ocr("GITHUB_TOKEN = ghp_ABCDEF1234567890abcdef1234567890ABCD")
    findings = detect_secrets(result, DetectionConfig(profile="security"))
    assert len(findings) == 1
    assert findings[0].type == "api_key"
    assert findings[0].risk == "critical"
    assert "ABCDEF123456" not in findings[0].preview

    # Google API Key
    result_g = fake_ocr("Google Maps Key: AIzaSyA1234567890abcdef1234567890abcde")
    findings_g = detect_secrets(result_g, DetectionConfig(profile="security"))
    assert len(findings_g) == 1
    assert findings_g[0].type == "api_key"
    assert findings_g[0].risk == "critical"

    # AWS Access Key ID vs Secret Key
    result_aws = fake_ocr(
        "AWS_ACCESS_KEY_ID = AKIAIOSFODNN7EXAMPLE",
        "AWS_SECRET_ACCESS_KEY = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    )
    findings_aws = detect_secrets(result_aws, DetectionConfig(profile="security"))
    assert len(findings_aws) == 2
    key_id = next(f for f in findings_aws if "Access Key ID" in f.label)
    secret_key = next(f for f in findings_aws if "Secret Access Key" in f.label)
    # Access Key ID is HIGH, Secret Key is CRITICAL
    assert key_id.risk == "high"
    assert secret_key.risk == "critical"


def test_TC03_jwt_token_detection_and_validation():
    jwt_sample = (
        "Authorization: Bearer "
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJhZG1pbiI6dHJ1ZX0."
        "TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ"
    )
    result = fake_ocr(jwt_sample)
    findings = detect_secrets(result, DetectionConfig(profile="security"))
    assert any(
        f.type == "jwt_token" and f.risk in ("high", "critical") for f in findings
    )


def test_TC04_private_key_multi_line():
    lines = [
        "-----BEGIN OPENSSH PRIVATE KEY-----",
        "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn",
        "NhAAAAAwEAAQAAAYEA0bW0W9h...secret_key_content...",
        "-----END OPENSSH PRIVATE KEY-----",
    ]
    result = fake_ocr(*lines)
    findings = detect_secrets(result, DetectionConfig(profile="security"))
    assert len(findings) >= 2
    assert all(f.type == "private_key" and f.risk == "critical" for f in findings)


def test_TC05_internal_network_ip_not_critical():
    result = fake_ocr(
        "Local network node: 192.168.1.100:8080",
        "Private VPC range: 10.240.0.5",
        "Internal service: api-gateway.corp.internal",
    )
    findings = detect_secrets(result, DetectionConfig(profile="security"))
    assert len(findings) == 3
    assert all(f.type == "internal_ip" for f in findings)
    # IPs must be LOW risk, never CRITICAL
    assert all(f.risk in ("low", "medium") for f in findings)
    assert all(f.risk != "critical" for f in findings)


@pytest.mark.parametrize(
    "text",
    [
        "DATABASE_PASSWORD=DemoPass123!",
        "DATABASE PASSWORD = DemoPass123!",
        '"DATABASE_PASSWORD": "A password with spaces!"',
        "postgresql: //demo:Secret123!@localhost :5432/demo",
        "Server=local;Database=demo;Password='Has spaces;and punctuation!';",
    ],
)
def test_ocr_variations_and_legacy_personal_defaults(text):
    result = detect_secrets(fake_ocr(text), DetectionConfig())
    assert any(f.type == "db_credential" for f in result)
    assert all(f.text == "[REDACTED_SECRET]" for f in result)


@pytest.mark.parametrize(
    "value",
    [
        "null",
        "true",
        "false",
        "none",
        "undefined",
        "******",
        "${DATABASE_PASSWORD}",
        "<password>",
    ],
)
def test_config_placeholders_are_not_credentials(value):
    assert (
        detect_secrets(fake_ocr(f"DATABASE_PASSWORD={value}"), DetectionConfig()) == []
    )


def test_type_toggle_and_low_confidence_are_honest():
    ocr = fake_ocr("DATABASE_PASSWORD=DemoPass123!", confidence=0.1)
    findings = detect_secrets(ocr, DetectionConfig())
    assert len(findings) == 1 and findings[0].ocr_confidence == 0.1
    assert findings[0].score <= 0.75
    assert not detect_secrets(ocr, DetectionConfig(sensitivity="low"))
    config = DetectionConfig()
    config.types.db_credential = False
    assert not detect_secrets(ocr, config)
    assert not detect_secrets(fake_ocr("192.168.1.100"), DetectionConfig())


@pytest.mark.parametrize(
    "text",
    [
        "OPENAI_API_KEY=DemoApiKey1234567890ABCDEF",
        "GITHUB_TOKEN=DemoAccessToken1234567890ABCDEF",
        '"AWS_SECRET_ACCESS_KEY": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"',
        "CLIENT_SECRET=FictitiousSecret123!",
    ],
)
def test_application_prefixes_and_secret_type_toggles(text):
    config = DetectionConfig()
    config.types.db_credential = False
    assert any(f.type == "api_key" for f in detect_secrets(fake_ocr(text), config))
    config.types.api_key = False
    assert detect_secrets(fake_ocr(text), config) == []


def test_two_factor_and_ui_password_detection():
    # 2FA Authenticator TOTP Secret
    ocr_2fa = fake_ocr("2FA Q6NT57WIEIR63ZLYFCUXLPYQIF6KKZXZ")
    findings = detect_secrets(ocr_2fa, DetectionConfig(profile="security"))
    assert any(f.type == "api_key" and "2FA" in f.label and f.risk == "critical" for f in findings)

    # Masked secret bullets
    ocr_mask = fake_ocr("2FA ........", "Pass ••••••••")
    find_mask = detect_secrets(ocr_mask, DetectionConfig(profile="security"))
    assert len(find_mask) == 2
    assert any("2FA" in f.label for f in find_mask)
    assert any("Mật khẩu" in f.label for f in find_mask)

    # UI Password field with space separator
    ocr_pw = fake_ocr("Pass MySecretKey123!")
    find_pw = detect_secrets(ocr_pw, DetectionConfig(profile="security"))
    assert any(f.type == "db_credential" and f.risk == "critical" for f in find_pw)

    # UI Pass placeholder 'Chưa có' should be ignored
    ocr_none = fake_ocr("Pass Chưa có", "Pass none")
    find_none = detect_secrets(ocr_none, DetectionConfig(profile="security"))
    assert len(find_none) == 0
