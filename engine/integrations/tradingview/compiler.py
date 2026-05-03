"""W-0393: Deterministic compiler — visible_atoms → CompiledHypothesisSpec.

This is the core safety gate. NO LLM free-form output may become an engine
condition without passing through this allowlist. Unsupported atoms are
preserved in unsupported_atoms and NEVER silently dropped into filters.
"""
from __future__ import annotations

import uuid
from .models import VisibleAtom, CompiledHypothesisSpec, VisionPatternSpec

# ── Allowlist: atom_kind → (feature_name, operator, strict, base, loose) ─────
_ATOM_TO_FILTER: dict[str, tuple[str, str, float, float, float]] = {
    "rsi_oversold":         ("rsi14",          "<",  30.0,  35.0,  40.0),
    "rsi_overbought":       ("rsi14",          ">",  70.0,  65.0,  60.0),
    "volume_spike":         ("vol_ratio_3",    ">",   2.0,   1.5,   1.2),
    "bb_squeeze":           ("bb_width",       "<",  0.03,  0.05,  0.08),
    "funding_extreme":      ("funding_rate",   "<", -0.0003, -0.0001, 0.0),
    "oi_spike":             ("oi_change_24h",  ">",  0.15,  0.10,  0.06),
    "macd_hist_condition":  ("macd_hist",      "<", -0.001,  0.0,   0.0),
    "stoch_rsi_condition":  ("stoch_rsi",      "<",  0.15,  0.20,  0.30),
}

# Atoms → trigger block (replaces default trigger)
_ATOM_TO_TRIGGER: dict[str, str] = {
    "breakout":             "breakout_above_high",
    "breakdown_reversal":   "sweep_below_low",
    "liquidity_sweep":      "sweep_below_low",
    "wyckoff_spring":       "spring_breach",
}

# Atoms → confirmation block
_ATOM_TO_CONFIRM: dict[str, str] = {
    "compression":          "sideways_compression",
    "reclaim_after_dump":   "reclaim_after_dump",
}

# Pattern family → base combo slug
_FAMILY_TO_BASE: dict[str, str] = {
    "breakout":           "volatility_squeeze_breakout",
    "breakdown_reversal": "wyckoff_spring_reversal",
    "liquidity_sweep":    "liquidity_sweep_reversal",
    "squeeze_breakout":   "volatility_squeeze_breakout",
    "trend_pullback":     "alpha_confluence",
    "unknown":            "alpha_confluence",
}

_FAMILY_DEFAULT_DIR: dict[str, str] = {
    "breakout": "long", "breakdown_reversal": "long",
    "liquidity_sweep": "long", "squeeze_breakout": "long",
    "trend_pullback": "long", "unknown": "long",
}

# Atoms treated as informational — not converted to any condition
_INFORMATIONAL = frozenset({
    "rsi_condition", "bb_condition", "ichimoku_condition",
    "price_below_cloud", "price_above_cloud",
    "ema20_condition", "ema50_condition",
})


def _filter_dict(feature_name: str, operator: str, value: float) -> dict:
    return {
        "feature_name": feature_name,
        "operator": operator,
        "value": value,
        "weight": 1.0,
        "filter_type": "hard",
    }


def compile_hypothesis(
    spec: VisionPatternSpec,
    chart_id: str,
) -> CompiledHypothesisSpec:
    """Compile VisionPatternSpec into CompiledHypothesisSpec.

    All three strictness variants (strict/base/loose) are pre-computed.
    Unsupported atoms are preserved — never silently dropped.
    """
    family = spec.pattern_family or "unknown"
    direction = spec.direction or _FAMILY_DEFAULT_DIR.get(family, "long")
    base_slug = _FAMILY_TO_BASE.get(family, "alpha_confluence")

    trigger_block = "breakout_above_high"
    confirmation_blocks: list[str] = []
    strict_filters: list[dict] = []
    base_filters: list[dict] = []
    loose_filters: list[dict] = []
    unsupported: list[dict] = []

    for atom in spec.visible_atoms:
        kind = atom.kind

        if kind in _ATOM_TO_TRIGGER:
            trigger_block = _ATOM_TO_TRIGGER[kind]
            continue

        if kind in _ATOM_TO_CONFIRM:
            blk = _ATOM_TO_CONFIRM[kind]
            if blk not in confirmation_blocks:
                confirmation_blocks.append(blk)
            continue

        if kind in _ATOM_TO_FILTER:
            feat, op, sv, bv, lv = _ATOM_TO_FILTER[kind]
            strict_filters.append(_filter_dict(feat, op, sv))
            base_filters.append(_filter_dict(feat, op, bv))
            loose_filters.append(_filter_dict(feat, op, lv))
            continue

        if kind in _INFORMATIONAL:
            unsupported.append({
                "kind": kind,
                "confidence": atom.confidence,
                "reason": "informational_only",
            })
            continue

        # Truly unsupported
        unsupported.append({
            "kind": kind,
            "confidence": atom.confidence,
            "reason": "not_in_allowlist",
        })

    prefix = f"tv-{chart_id}"

    def _pv_dict(suffix: str, filters: list[dict]) -> dict:
        from research.pattern_search import PatternVariantSpec, IndicatorFilter
        pv = PatternVariantSpec(
            pattern_slug=base_slug,
            variant_slug=f"{prefix}-{suffix}",
            timeframe="4h",
            indicator_filters=tuple(
                IndicatorFilter(
                    feature_name=f["feature_name"],
                    operator=f["operator"],
                    value=f["value"],
                )
                for f in filters
            ),
            search_origin="tv_import",
            selection_bias=0.7,
            variant_id=str(uuid.uuid4()),
        )
        return pv.to_dict()

    strictness_variants = {
        "strict": _pv_dict("strict", strict_filters),
        "base":   _pv_dict("base",   base_filters),
        "loose":  _pv_dict("loose",  loose_filters),
    }

    compiler_confidence = spec.confidence if base_filters else max(0.1, spec.confidence * 0.3)

    return CompiledHypothesisSpec(
        base_pattern_slug=base_slug,
        variant_slug=f"{prefix}-base",
        direction=direction,
        timeframe="4h",
        trigger_block=trigger_block,
        confirmation_blocks=confirmation_blocks,
        indicator_filters=base_filters,
        unsupported_atoms=unsupported,
        compiler_confidence=compiler_confidence,
        strictness_variants=strictness_variants,
    )
