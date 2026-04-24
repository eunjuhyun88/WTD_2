"""Deterministic PatternDraft -> SearchQuerySpec transformation."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

TRANSFORMER_VERSION = "query-transformer-v1"
SIGNAL_VOCAB_VERSION = "signal-vocab-v2"
RULE_REGISTRY_VERSION = "signal-rule-registry-v2"

_SIGNAL_RULES: dict[str, dict[str, dict[str, Any]]] = {
    # ── A. OI signals ─────────────────────────────────────────────────────
    "oi_spike": {
        "required_numeric": {"oi_zscore": {"min": 1.5}},
        "required_boolean": {"oi_spike_flag": True},
    },
    "oi_small_uptick": {
        "required_boolean": {"oi_small_uptick_flag": True},
        "required_numeric": {"oi_change_24h": {"min": 0.0, "max": 0.03}},
    },
    "oi_hold_after_spike": {
        "required_boolean": {"oi_hold_flag": True},
    },
    "oi_reexpansion": {
        "required_boolean": {"oi_reexpansion_flag": True},
        "required_numeric": {"oi_zscore": {"min": 1.0}},
    },
    "oi_unwind": {
        "required_boolean": {"oi_unwind_flag": True},
        "required_numeric": {"oi_change_24h": {"max": -0.04}},
    },
    # ── B. Funding signals ────────────────────────────────────────────────
    "funding_extreme_short": {
        "required_boolean": {"funding_extreme_short_flag": True},
        "required_numeric": {"funding_rate": {"max": -0.0003}},
    },
    "funding_extreme_long": {
        "required_boolean": {"funding_extreme_long_flag": True},
        "required_numeric": {"funding_rate": {"min": 0.0003}},
    },
    "funding_positive": {
        "required_boolean": {"funding_positive_flag": True},
    },
    "funding_flip_negative_to_positive": {
        "required_boolean": {"funding_flip_negative_to_positive": True},
    },
    "funding_flip_positive_to_negative": {
        "required_boolean": {"funding_flip_positive_to_negative": True},
    },
    # Legacy alias kept for backward compat
    "short_funding_pressure": {
        "required_numeric": {"funding_rate": {"max": -0.0002}},
    },
    "long_funding_pressure": {
        "required_numeric": {"funding_rate": {"min": 0.0002}},
    },
    # ── C. Volume signals ─────────────────────────────────────────────────
    "volume_spike": {
        "required_boolean": {"volume_spike_flag": True},
        "required_numeric": {"vol_zscore": {"min": 2.0}},
    },
    "low_volume": {
        "required_boolean": {"low_volume_flag": True},
        "required_numeric": {"vol_zscore": {"max": 0.5}},
    },
    "volume_dryup": {
        "required_boolean": {"volume_dryup_flag": True},
        "required_numeric": {"vol_zscore": {"max": -0.5}},
    },
    # Legacy alias
    "volume_breakout": {
        "required_boolean": {"volume_spike_flag": True},
    },
    # ── D. Price structure signals ────────────────────────────────────────
    "price_dump": {
        "required_boolean": {"price_dump_flag": True},
        "required_numeric": {"price_change_4h": {"max": -0.04}},
    },
    "price_spike": {
        "required_boolean": {"price_spike_flag": True},
        "required_numeric": {"price_change_4h": {"min": 0.04}},
    },
    "fresh_low_break": {
        "required_boolean": {"fresh_low_break_flag": True},
        "required_numeric": {"price_change_1h": {"max": -0.02}},
    },
    "higher_lows_sequence": {
        "required_boolean": {"higher_lows_sequence_flag": True},
        "required_numeric": {"higher_low_count": {"min": 2.0}},
    },
    "higher_highs_sequence": {
        "required_numeric": {"higher_high_count": {"min": 1.0}},
    },
    "sideways": {
        "required_boolean": {"sideways_flag": True},
        "required_numeric": {"range_width_pct": {"max": 0.06}},
    },
    "upward_sideways": {
        "required_boolean": {"upward_sideways_flag": True},
    },
    "arch_zone": {
        "required_boolean": {"arch_zone_flag": True},
        "required_numeric": {"compression_ratio": {"min": 0.5}},
    },
    "breakout": {
        "required_numeric": {"breakout_strength": {"min": 0.01}},
    },
    "range_high_break": {
        "required_boolean": {"range_high_break": True},
        "required_numeric": {"breakout_strength": {"min": 0.01}},
    },
    # Legacy alias
    "dump_then_reclaim": {
        "preferred_boolean": {"price_spike_flag": True},
        "preferred_numeric": {"price_change_4h": {"min": 0.02}},
    },
    # ── E. Positioning signals ────────────────────────────────────────────
    "short_build_up": {
        "required_boolean": {"short_build_up_flag": True},
        "required_numeric": {"long_short_ratio": {"max": 0.9}},
    },
    "long_build_up": {
        "required_boolean": {"long_build_up_flag": True},
        "required_numeric": {"long_short_ratio": {"min": 1.15}},
    },
    "short_to_long_switch": {
        "required_boolean": {"short_to_long_switch_flag": True},
    },
}


@dataclass(frozen=True)
class TransformerMeta:
    transformer_version: str = TRANSFORMER_VERSION
    signal_vocab_version: str = SIGNAL_VOCAB_VERSION
    rule_registry_version: str = RULE_REGISTRY_VERSION

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class PhaseQuery:
    phase_id: str
    label: str
    sequence_order: int
    required_numeric: dict[str, dict[str, float]] = field(default_factory=dict)
    required_boolean: dict[str, bool] = field(default_factory=dict)
    preferred_numeric: dict[str, dict[str, float]] = field(default_factory=dict)
    preferred_boolean: dict[str, bool] = field(default_factory=dict)
    forbidden_numeric: dict[str, dict[str, float]] = field(default_factory=dict)
    forbidden_boolean: dict[str, bool] = field(default_factory=dict)
    max_gap_bars: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SearchQuerySpec:
    schema_version: int
    pattern_family: str
    reference_timeframe: str
    phase_path: list[str]
    phase_queries: list[PhaseQuery]
    must_have_signals: list[str]
    preferred_timeframes: list[str]
    exclude_patterns: list[str]
    similarity_focus: list[str]
    symbol_scope: list[str]
    transformer_meta: TransformerMeta = field(default_factory=TransformerMeta)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["transformer_meta"] = self.transformer_meta.to_dict()
        payload["phase_queries"] = [phase.to_dict() for phase in self.phase_queries]
        return payload


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def _normalize_phase_rows(pattern_draft: dict[str, Any]) -> list[dict[str, Any]]:
    raw_phases = pattern_draft.get("phases")
    if not isinstance(raw_phases, list):
        return []
    phases = [phase for phase in raw_phases if isinstance(phase, dict) and phase.get("phase_id")]
    return sorted(
        phases,
        key=lambda phase: int(phase.get("sequence_order", 0)),
    )


def _apply_signal(
    signal: str,
    *,
    target_numeric: dict[str, dict[str, float]],
    target_boolean: dict[str, bool],
) -> None:
    rules = _SIGNAL_RULES.get(signal)
    if not rules:
        return
    for metric, config in rules.get("required_numeric", {}).items():
        target_numeric[metric] = dict(config)
    for metric, value in rules.get("required_boolean", {}).items():
        target_boolean[metric] = bool(value)
    for metric, config in rules.get("preferred_numeric", {}).items():
        target_numeric.setdefault(metric, dict(config))
    for metric, value in rules.get("preferred_boolean", {}).items():
        target_boolean.setdefault(metric, bool(value))


def _phase_query_from_draft(phase: dict[str, Any]) -> PhaseQuery:
    required_numeric: dict[str, dict[str, float]] = {}
    required_boolean: dict[str, bool] = {}
    preferred_numeric: dict[str, dict[str, float]] = {}
    preferred_boolean: dict[str, bool] = {}
    forbidden_numeric: dict[str, dict[str, float]] = {}
    forbidden_boolean: dict[str, bool] = {}

    for signal in phase.get("signals_required", []) or []:
        if isinstance(signal, str):
            _apply_signal(
                signal,
                target_numeric=required_numeric,
                target_boolean=required_boolean,
            )
    for signal in phase.get("signals_preferred", []) or []:
        if isinstance(signal, str):
            _apply_signal(
                signal,
                target_numeric=preferred_numeric,
                target_boolean=preferred_boolean,
            )
    for signal in phase.get("signals_forbidden", []) or []:
        if isinstance(signal, str):
            _apply_signal(
                signal,
                target_numeric=forbidden_numeric,
                target_boolean=forbidden_boolean,
            )

    return PhaseQuery(
        phase_id=str(phase["phase_id"]),
        label=str(phase.get("label") or phase["phase_id"]),
        sequence_order=int(phase.get("sequence_order", 0)),
        required_numeric=required_numeric,
        required_boolean=required_boolean,
        preferred_numeric=preferred_numeric,
        preferred_boolean=preferred_boolean,
        forbidden_numeric=forbidden_numeric,
        forbidden_boolean=forbidden_boolean,
        max_gap_bars=int(phase["max_gap_bars"]) if isinstance(phase.get("max_gap_bars"), int) else None,
    )


def transform_pattern_draft(pattern_draft: dict[str, Any]) -> SearchQuerySpec:
    if not isinstance(pattern_draft, dict):
        raise ValueError("pattern_draft must be a dict")

    pattern_family = str(pattern_draft.get("pattern_family") or "").strip()
    if not pattern_family:
        raise ValueError("pattern_draft.pattern_family is required")

    phases = _normalize_phase_rows(pattern_draft)
    if not phases:
        raise ValueError("pattern_draft.phases must contain at least one phase")

    reference_timeframe = str(pattern_draft.get("timeframe") or phases[0].get("timeframe") or "").strip()
    if not reference_timeframe:
        raise ValueError("pattern_draft.timeframe is required")

    phase_queries = [_phase_query_from_draft(phase) for phase in phases]
    phase_path = [query.phase_id for query in phase_queries]

    search_hints = pattern_draft.get("search_hints") if isinstance(pattern_draft.get("search_hints"), dict) else {}
    must_have_signals = _dedupe(
        [
            *[
                str(value)
                for value in (search_hints.get("must_have_signals") or [])
                if isinstance(value, str)
            ],
            *[
                str(signal)
                for phase in phases
                for signal in (phase.get("signals_required") or [])
                if isinstance(signal, str)
            ],
        ]
    )
    preferred_timeframes = _dedupe(
        [
            reference_timeframe,
            *[
                str(value)
                for value in (search_hints.get("preferred_timeframes") or [])
                if isinstance(value, str)
            ],
        ]
    )
    similarity_focus = _dedupe(
        [
            str(value)
            for value in (search_hints.get("similarity_focus") or [])
            if isinstance(value, str)
        ]
    )
    if not similarity_focus:
        similarity_focus = ["phase_path", "required_signals"]

    exclude_patterns = _dedupe(
        [
            str(value)
            for value in (search_hints.get("exclude_patterns") or [])
            if isinstance(value, str)
        ]
    )

    symbol_scope = _dedupe(
        [
            *[
                str(value)
                for value in (pattern_draft.get("symbol_candidates") or [])
                if isinstance(value, str)
            ],
            *[
                str(value)
                for value in (search_hints.get("symbol_scope") or [])
                if isinstance(value, str)
            ],
        ]
    )

    return SearchQuerySpec(
        schema_version=int(pattern_draft.get("schema_version", 1) or 1),
        pattern_family=pattern_family,
        reference_timeframe=reference_timeframe,
        phase_path=phase_path,
        phase_queries=phase_queries,
        must_have_signals=must_have_signals,
        preferred_timeframes=preferred_timeframes,
        exclude_patterns=exclude_patterns,
        similarity_focus=similarity_focus,
        symbol_scope=symbol_scope,
    )


__all__ = [
    "PhaseQuery",
    "SearchQuerySpec",
    "TransformerMeta",
    "transform_pattern_draft",
]
