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


class OCRResult(ContractModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    blocks: list[OCRBlock]
    language: str


class Finding(ContractModel):
    id: str
    type: Literal["email", "phone", "cccd", "student", "bank", "custom", "manual"]
    label: str
    text: str
    risk: Literal["low", "medium", "high"]
    box: BoundingBox


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


class ScanResult(ContractModel):
    status: Literal["complete"]
    source: Literal["ocr"]
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    findings: list[Finding]
    message: str
