"""Schemas for memory query/rerank contracts (Phase 1)."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


MemoryKind = Literal[
    "identity",
    "belief",
    "experience",
    "preference",
    "fact",
    "procedure",
    "debug_hypothesis",
    "debug_rejected",
]


class MemoryContext(BaseModel):
    symbol: str | None = None
    timeframe: str | None = None
    mode: str | None = None
    intent: str | None = None
    challenge_slug: str | None = None
    challenge_instance: str | None = None
    as_of: str | None = None


class MemoryCandidate(BaseModel):
    id: str
    kind: MemoryKind
    text: str
    base_score: float = 0.0
    confidence: Literal["verified", "observed", "hypothesis"] = "observed"
    access_count: int = 0
    tags: list[str] = Field(default_factory=list)
    conditions: dict[str, Any] = Field(default_factory=dict)


class MemoryQueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    context: MemoryContext = Field(default_factory=MemoryContext)
    candidates: list[MemoryCandidate] = Field(default_factory=list)
    top_k: int = Field(default=8, ge=1, le=50)


class MemoryRankedRecord(BaseModel):
    id: str
    kind: MemoryKind
    text: str
    score: float
    base_score: float
    confidence: Literal["verified", "observed", "hypothesis"]
    access_count: int
    tags: list[str]
    reasons: list[str] = Field(default_factory=list)


class MemoryQueryDebug(BaseModel):
    rerank_applied: bool
    base_result_count: int
    elapsed_ms: int


class MemoryQueryResponse(BaseModel):
    ok: bool = True
    schema_version: int = 1
    query_id: str
    records: list[MemoryRankedRecord]
    debug: MemoryQueryDebug


MemoryFeedbackEvent = Literal["retrieved", "used", "dismissed", "contradicted", "confirmed"]


class MemoryFeedbackRequest(BaseModel):
    query_id: str = Field(..., min_length=1)
    memory_id: str = Field(..., min_length=1)
    event: MemoryFeedbackEvent
    context: MemoryContext = Field(default_factory=MemoryContext)
    occurred_at: str | None = None
    note: str | None = Field(default=None, max_length=500)


class MemoryFeedbackResponse(BaseModel):
    ok: bool = True
    schema_version: int = 1
    memory_id: str
    access_count: int = 0
    updated_at: str


class MemoryFeedbackBatchRequest(BaseModel):
    items: list[MemoryFeedbackRequest] = Field(..., min_length=1, max_length=100)


class MemoryFeedbackBatchItem(BaseModel):
    memory_id: str
    access_count: int = 0
    updated_at: str


class MemoryFeedbackBatchResponse(BaseModel):
    ok: bool = True
    schema_version: int = 1
    processed: int
    items: list[MemoryFeedbackBatchItem]


DebugHypothesisStatus = Literal["open", "confirmed", "rejected"]


class DebugHypothesis(BaseModel):
    id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1)
    status: DebugHypothesisStatus
    evidence: list[str] = Field(default_factory=list)
    rejection_reason: str | None = None


class MemoryDebugSessionRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    context: MemoryContext = Field(default_factory=MemoryContext)
    hypotheses: list[DebugHypothesis] = Field(..., min_length=1)
    started_at: str
    ended_at: str | None = None


class MemoryDebugSessionResponse(BaseModel):
    ok: bool = True
    schema_version: int = 1
    session_id: str
    rejected_indexed: int
    updated_at: str


class MemoryRejectedLookupRequest(BaseModel):
    symbol: str | None = None
    intent: str | None = None
    query: str | None = None
    limit: int = Field(default=10, ge=1, le=100)


class MemoryRejectedRecord(BaseModel):
    id: str
    session_id: str
    text: str
    rejection_reason: str | None = None
    symbol: str | None = None
    intent: str | None = None
    updated_at: str


class MemoryRejectedLookupResponse(BaseModel):
    ok: bool = True
    schema_version: int = 1
    records: list[MemoryRejectedRecord]
