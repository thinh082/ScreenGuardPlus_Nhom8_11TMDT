from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BoundingBox(ContractModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class OCRBlock(ContractModel):
    text: str
    box: BoundingBox
    confidence: float = Field(ge=0, le=1)
    line_id: tuple[int, int, int, int] = (1, 1, 1, 1)


class TokenSpan(ContractModel):
    start: int
    end: int
    token_index: int


class OCRLine(ContractModel):
    text: str
    spans: list[TokenSpan]


class OCRResult(ContractModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    blocks: list[OCRBlock]
    language: str
    text: str = ""
    lines: list[OCRLine] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class Finding(ContractModel):
    id: str
    type: Literal[
        "email",
        "phone",
        "cccd",
        "student",
        "bank",
        "custom",
        "manual",
        "db_credential",
        "api_key",
        "private_key",
        "jwt_token",
        "internal_ip",
    ]
    label: str
    text: str
    risk: Literal["low", "medium", "high", "critical"]
    box: BoundingBox
    score: float = Field(default=0.8, ge=0, le=1)
    ocr_confidence: float = Field(default=0, ge=0, le=1)
    preview: str = ""
    source: str = "ocr_regex"


class CustomRule(ContractModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=60)
    kind: Literal["keyword", "regex"]
    pattern: str = Field(min_length=1, max_length=200)
    risk: Literal["low", "medium", "high"] = "medium"
    enabled: bool = True


class DetectionTypes(ContractModel):
    email: bool = True
    phone: bool = True
    cccd: bool = True
    student: bool = True
    bank: bool = True
    custom: bool = True
    db_credential: bool = True
    api_key: bool = True
    private_key: bool = True
    jwt_token: bool = True
    internal_ip: bool = True


class DetectionConfig(ContractModel):
    types: DetectionTypes = Field(default_factory=DetectionTypes)
    rules: list[CustomRule] = Field(default_factory=list, max_length=30)
    mode: Literal["auto", "manual"] = "auto"
    sensitivity: Literal["low", "balanced", "high"] = "balanced"
    language: Literal["vie", "eng", "vie+eng"] = "vie+eng"
    profile: Literal["personal", "security"] = "personal"
    destination: Literal["public", "internal"] = "public"


class APIFinding(ContractModel):
    id: str
    type: Literal[
        "EMAIL",
        "PHONE",
        "CITIZEN_ID",
        "STUDENT_ID",
        "BANK_ACCOUNT",
        "CUSTOM",
        "DB_CREDENTIAL",
        "API_KEY",
        "PRIVATE_KEY",
        "JWT_TOKEN",
        "INTERNAL_IP",
    ]
    label: str
    bbox: tuple[int, int, int, int]
    risk: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    score: float = Field(ge=0, le=1)
    ocr_confidence: float = Field(ge=0, le=1)
    preview: str
    source: Literal["ocr_regex", "ocr_keyword"]


PolicyDecision = Literal["ALLOW", "WARN", "BLOCK"]


class PolicyResult(ContractModel):
    decision: PolicyDecision
    reasons: list[str] = Field(default_factory=list)
    unredacted_mandatory_count: int = 0
    unredacted_warning_count: int = 0
    blocked_findings: list[str] = Field(default_factory=list)


class ScanResult(ContractModel):
    mode: Literal["real_ocr"] = "real_ocr"
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    findings: list[APIFinding]
    language: str
    warnings: list[str] = Field(default_factory=list)
    message: str
    profile: Literal["personal", "security"] = "personal"
    destination: Literal["public", "internal"] = "public"
    scan_ticket: str = ""
    policy_decision: PolicyDecision = "ALLOW"
    policy_reasons: list[str] = Field(default_factory=list)
    image_hash: str = ""


class ExportRequest(ContractModel):
    ticket: str = Field(min_length=1, max_length=100)
    destination: Literal["public", "internal"] = "public"
    confirmed_warnings: list[str] = Field(default_factory=list, max_length=10)
    redactions: list[BoundingBox] = Field(default_factory=list, max_length=500)


class ExportVerificationResult(ContractModel):
    verified: bool = True
    image_hash: str
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    decision: PolicyDecision = "ALLOW"
    reasons: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
