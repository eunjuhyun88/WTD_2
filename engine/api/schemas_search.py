from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class SearchCorpusWindowSummary(BaseModel):
    window_id: str
    symbol: str
    timeframe: str
    start_ts: str
    end_ts: str
    bars: int
    source: str
    signature: dict[str, Any] = Field(default_factory=dict)


class SearchCatalogResponse(BaseModel):
    ok: bool = True
    owner: Literal["engine"] = "engine"
    plane: Literal["search"] = "search"
    status: str
    generated_at: str
    total_windows: int
    windows: list[SearchCorpusWindowSummary] = Field(default_factory=list)


class SearchCandidate(BaseModel):
    candidate_id: str
    window_id: str | None = None
    symbol: str | None = None
    timeframe: str | None = None
    score: float
    payload: dict[str, Any] = Field(default_factory=dict)


class SeedSearchRequest(BaseModel):
    symbol: str | None = None
    timeframe: str | None = None
    signature: dict[str, Any] = Field(default_factory=dict)
    limit: int = Field(default=10, ge=1, le=100)


class SeedSearchResponse(BaseModel):
    ok: bool = True
    owner: Literal["engine"] = "engine"
    plane: Literal["search"] = "search"
    status: str
    generated_at: str
    run_id: str
    request: dict[str, Any] = Field(default_factory=dict)
    candidates: list[SearchCandidate] = Field(default_factory=list)


class ScanRequest(BaseModel):
    symbol: str | None = None
    timeframe: str | None = None
    limit: int = Field(default=20, ge=1, le=100)


class ScanResponse(BaseModel):
    ok: bool = True
    owner: Literal["engine"] = "engine"
    plane: Literal["search"] = "search"
    status: str
    generated_at: str
    scan_id: str
    request: dict[str, Any] = Field(default_factory=dict)
    candidates: list[SearchCandidate] = Field(default_factory=list)
