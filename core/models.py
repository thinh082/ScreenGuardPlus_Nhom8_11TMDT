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
    type: Literal["email", "phone", "cccd", "student", "bank", "custom", "manual"]
    label: str
    text: str
    risk: Literal["low", "medium", "high"]
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


class DetectionConfig(ContractModel):
    types: DetectionTypes = Field(default_factory=DetectionTypes)
    rules: list[CustomRule] = Field(default_factory=list, max_length=30)
    mode: Literal["auto", "manual"] = "auto"
    sensitivity: Literal["low", "balanced", "high"] = "balanced"
    language: Literal["vie", "eng", "vie+eng"] = "vie+eng"


class APIFinding(ContractModel):
    id: str
    type: Literal["EMAIL", "PHONE", "CITIZEN_ID", "STUDENT_ID", "BANK_ACCOUNT", "CUSTOM"]
    label: str
    bbox: tuple[int, int, int, int]
    risk: Literal["LOW", "MEDIUM", "HIGH"]
    score: float = Field(ge=0, le=1)
    ocr_confidence: float = Field(ge=0, le=1)
    preview: str
    source: Literal["ocr_regex", "ocr_keyword"]


class ScanResult(ContractModel):
    mode: Literal["real_ocr"] = "real_ocr"
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    findings: list[APIFinding]
    language: str
    warnings: list[str] = Field(default_factory=list)
    message: str
