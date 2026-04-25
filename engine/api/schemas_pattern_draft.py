from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class PatternDraftPhaseBody(BaseModel):
    phase_id: str
    label: str
    sequence_order: int = Field(default=0, ge=0)
    description: str = ""
    timeframe: str | None = None
    signals_required: list[str] = Field(default_factory=list, max_length=24)
    signals_preferred: list[str] = Field(default_factory=list, max_length=24)
    signals_forbidden: list[str] = Field(default_factory=list, max_length=24)
    directional_belief: str | None = None
    evidence_text: str | None = None
    time_hint: str | None = None
    importance: float | None = Field(default=None, ge=0.0, le=1.0)


class PatternDraftSearchHintsBody(BaseModel):
    must_have_signals: list[str] = Field(default_factory=list, max_length=24)
    preferred_timeframes: list[str] = Field(default_factory=list, max_length=8)
    exclude_patterns: list[str] = Field(default_factory=list, max_length=24)
    similarity_focus: list[str] = Field(default_factory=list, max_length=12)
    symbol_scope: list[str] = Field(default_factory=list, max_length=32)


class PatternDraftBody(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    pattern_family: str
    pattern_label: str | None = None
    source_type: str
    source_text: str
    symbol_candidates: list[str] = Field(default_factory=list, max_length=16)
    timeframe: str | None = None
    thesis: list[str] = Field(default_factory=list, max_length=12)
    phases: list[PatternDraftPhaseBody] = Field(default_factory=list, max_length=12)
    trade_plan: dict[str, Any] = Field(default_factory=dict)
    search_hints: PatternDraftSearchHintsBody = Field(default_factory=PatternDraftSearchHintsBody)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    ambiguities: list[str] = Field(default_factory=list, max_length=16)


class ParserMetaBody(BaseModel):
    parser_role: str
    parser_model: str
    parser_prompt_version: str
    pattern_draft_schema_version: int = Field(default=1, ge=1)
    signal_vocab_version: str
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    ambiguity_count: int = Field(default=0, ge=0)


class PatternDraftTransformRequest(BaseModel):
    pattern_draft: PatternDraftBody
    parser_meta: ParserMetaBody | None = None


class PatternDraftTransformResponse(BaseModel):
    ok: bool = True
    owner: Literal["engine"] = "engine"
    plane: Literal["search"] = "search"
    status: Literal["transformed"] = "transformed"
    generated_at: str
    search_query_spec: dict[str, Any]
    transformer_meta: dict[str, Any] = Field(default_factory=dict)
    parser_meta: dict[str, Any] | None = None
