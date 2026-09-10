from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

CadenceUnit = Literal["day", "week", "month"]
CadenceSource = Literal["personal", "community", "default"]


class KnownItem(BaseModel):
    """사용자가 이미 가진 항목. 매칭 후보 풀이 된다."""

    id: str
    name: str
    last_done_on: date | None = None


class ParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    reference_date: date
    known_items: list[KnownItem] = Field(default_factory=list)


class Candidate(BaseModel):
    item_id: str
    name: str
    similarity: float = Field(ge=0.0, le=1.0)


class ParseResponse(BaseModel):
    """
    intent 가 갈림길이다 — 설계 07-C.

    같은 입력창에 "이불 빨았어"(기록)와 "이불 언제 빨았어?"(조회)가 함께 들어온다.
    둘을 구분하지 못하면 물어본 것을 기록으로 남겨 없던 일이 생긴다.
    """

    intent: Literal["record", "query"] = "record"
    """사용자가 문장에서 직접 말한 주기(일수). 말하지 않았으면 None."""
    stated_cadence_days: int | None = None
    normalized_name: str | None
    done_on: date
    matched_item_id: str | None
    candidates: list[Candidate] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str | None = None


class CadenceRequest(BaseModel):
    item_name: str = Field(min_length=1, max_length=60)
    # 이 사용자가 실제로 이 일을 한 날짜들. 오름차순.
    history: list[date] = Field(default_factory=list)
    user_average_interval_days: float | None = None


class CadenceResponse(BaseModel):
    unit: CadenceUnit
    interval: int = Field(ge=1, le=365)
    weekdays: list[int] = Field(default_factory=list)
    source: CadenceSource
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str


class EmbedRequest(BaseModel):
    text: str = Field(min_length=1, max_length=300)


class EmbedResponse(BaseModel):
    embedding: list[float]
