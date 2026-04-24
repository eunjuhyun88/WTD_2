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
    definition_ref: dict[str, Any] | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class SeedSearchRequest(BaseModel):
    definition_id: str | None = None
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
    definition_id: str | None = None
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


# ── Pattern similarity search (feature_windows based) ────────────────────────

class SimilarSearchRequest(BaseModel):
    pattern_draft: dict[str, Any]
    top_k: int = Field(default=10, ge=1, le=50)
    since_days: int | None = Field(default=180, ge=1, le=730)


class SimilarCandidateOut(BaseModel):
    symbol: str
    timeframe: str
    bar_ts_ms: int
    bar_iso: str
    feature_score: float
    sequence_score: float
    context_score: float
    final_score: float
    observed_phase_path: list[str] = Field(default_factory=list)
    matched_phase_path: list[str] = Field(default_factory=list)
    missing_phases: list[str] = Field(default_factory=list)
    phase_feature_scores: list[dict[str, Any]] = Field(default_factory=list)


class SimilarSearchResponse(BaseModel):
    ok: bool = True
    owner: Literal["engine"] = "engine"
    plane: Literal["research"] = "research"
    spec_pattern_family: str
    spec_phase_path: list[str]
    reference_timeframe: str
    total_candidates_found: int
    top_k: int
    candidates: list[SimilarCandidateOut] = Field(default_factory=list)
    search_meta: dict[str, Any] = Field(default_factory=dict)
    generated_at: str
