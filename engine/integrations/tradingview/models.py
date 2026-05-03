"""W-0393: TradingView Idea Twin — shared data models."""
from __future__ import annotations

import uuid as _uuid
from dataclasses import dataclass, field


@dataclass(frozen=True)
class TVChartMeta:
    chart_id: str
    source_url: str
    source_type: str            # "tradingview_chart" | "tradingview_idea" | "image_upload"
    symbol: str | None
    exchange: str | None
    timeframe_raw: str | None
    timeframe_engine: str | None
    title: str | None
    description: str | None
    author_username: str | None
    author_display_name: str | None
    snapshot_url: str | None
    snapshot_bytes: bytes | None    # for vision parser, not persisted


@dataclass(frozen=True)
class VisibleAtom:
    kind: str
    confidence: float
    source: str = "vision"          # "pine" | "text" | "vision"


@dataclass(frozen=True)
class VisionPatternSpec:
    direction: str | None
    pattern_family: str             # breakout|breakdown_reversal|squeeze_breakout|liquidity_sweep|trend_pullback|unknown
    visible_indicators: list[str]
    visible_annotations: list[str]
    support_resistance_notes: list[str]
    visible_atoms: list[VisibleAtom]
    confidence: float
    evidence: list[dict]
    parser_tier: str                # "pine" | "text" | "vision"


@dataclass(frozen=True)
class CompiledHypothesisSpec:
    base_pattern_slug: str
    variant_slug: str
    direction: str
    timeframe: str
    trigger_block: str
    confirmation_blocks: list[str]
    indicator_filters: list[dict]       # PatternVariantSpec filter dicts
    unsupported_atoms: list[dict]
    compiler_confidence: float
    strictness_variants: dict[str, dict]    # strict/base/loose → PatternVariantSpec.to_dict()


@dataclass(frozen=True)
class ImportDiagnostics:
    estimated_signal_count: int
    filter_dropoff: list[dict]
    min_sample_pass: bool
    leakage_risk: str
    selection_bias: float
    warnings: list[str]
    suggested_relaxations: list[dict]


@dataclass
class TVImportDraft:
    draft_id: str = field(default_factory=lambda: str(_uuid.uuid4()))
    source_url: str = ""
    chart_id: str = ""
    source_type: str = "tradingview_chart"
    parser_tier: str = "vision"
    symbol: str | None = None
    exchange: str | None = None
    timeframe_raw: str | None = None
    timeframe_engine: str | None = None
    title: str | None = None
    description: str | None = None
    author_username: str | None = None
    author_display_name: str | None = None
    snapshot_url: str | None = None
    snapshot_storage_path: str | None = None
    vision_spec: VisionPatternSpec | None = None
    compiler_spec: CompiledHypothesisSpec | None = None
    diagnostics: ImportDiagnostics | None = None
    status: str = "draft"
