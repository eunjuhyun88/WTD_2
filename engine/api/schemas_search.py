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


# ── /search/similar — 3-layer ranked search ──────────────────────────────────

class SimilarSearchRequest(BaseModel):
    pattern_draft: dict[str, Any] = Field(
        default_factory=dict,
        description="PatternDraft with phases and search_hints. "
                    "search_hints.target_return_pct / volatility_range / "
                    "volume_breakout_threshold are used for Layer A scoring.",
    )
    observed_phase_paths: list[str] = Field(
        default_factory=list,
        description="Ordered phase IDs the user has already observed "
                    "(e.g. ['DUMP','ACCUMULATION']). Activates Layer B scoring.",
        max_length=20,
    )
    symbol: str | None = Field(
        None,
        description="Optional corpus filter — restrict candidates to one symbol.",
    )
    timeframe: str = Field(
        default="4h",
        description="Target timeframe for corpus candidates.",
    )
    top_k: int = Field(
        default=10,
        ge=1,
        le=50,
        description="Maximum candidates returned.",
    )


class SimilarCandidate(BaseModel):
    candidate_id: str
    window_id: str
    symbol: str
    timeframe: str
    start_ts: str
    end_ts: str
    bars: int
    final_score: float = Field(description="Blended 3-layer score ∈ [0, 1]")
    layer_a_score: float = Field(description="Feature signature similarity")
    layer_b_score: float | None = Field(
        None, description="Phase path LCS similarity (None if no observed_phase_paths)"
    )
    layer_c_score: float | None = Field(
        None, description="ML p_win from LightGBM (None if model not trained)"
    )
    candidate_phase_path: list[str] = Field(
        default_factory=list,
        description="Actual observed phase sequence for this candidate symbol.",
    )
    signature: dict[str, Any] = Field(default_factory=dict)


class SimilarSearchResponse(BaseModel):
    ok: bool = True
    owner: Literal["engine"] = "engine"
    plane: Literal["search"] = "search"
    status: str
    generated_at: str
    run_id: str
    request: dict[str, Any] = Field(default_factory=dict)
    candidates: list[SimilarCandidate] = Field(default_factory=list)
    scoring_layers: dict[str, bool] = Field(
        default_factory=dict,
        description="Which layers were active: {layer_a, layer_b, layer_c}",
    )


# ── /search/quality — judgement and weight recalibration ─────────────────────

class QualityJudgementRequest(BaseModel):
    run_id: str
    candidate_id: str
    verdict: str = Field(
        description="'good' | 'bad' | 'neutral'",
        pattern="^(good|bad|neutral)$",
    )
    symbol: str | None = None
    layer_a_score: float | None = None
    layer_b_score: float | None = None
    layer_c_score: float | None = None
    final_score: float | None = None
    user_id: str | None = None


class QualityJudgementResponse(BaseModel):
    ok: bool = True
    judgement_id: str


class QualityStatsResponse(BaseModel):
    ok: bool = True
    owner: Literal["engine"] = "engine"
    plane: Literal["search"] = "search"
    total_judgements: int
    layers: dict[str, Any] = Field(default_factory=dict)
    active_weights: dict[str, float] = Field(default_factory=dict)
    generated_at: str
