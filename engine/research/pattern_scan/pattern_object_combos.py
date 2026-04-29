"""PatternObject → PatternCombo bridge.

Wraps each PatternObject from patterns.library into a PatternCombo that
feeds building-block signals into PatternStateMachine bar-by-bar, then
collects the entry-phase timestamps as EntrySignal list for backtesting.

Usage:
    from research.pattern_scan.pattern_object_combos import LIBRARY_COMBOS
    scanner = PatternScanner(store=store, combos=LIBRARY_COMBOS)
    df = scanner.scan_universe(symbols)
"""
from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable

import pandas as pd

from building_blocks.context import Context
from backtest.types import EntrySignal
from patterns.state_machine import PatternStateMachine
from patterns.types import PatternObject
from research.pattern_scan.scanner import PatternCombo

log = logging.getLogger("engine.pattern_scan.pattern_object_combos")

# ── Block registry ─────────────────────────────────────────────────────────────
# Maps block_name → callable(ctx) → pd.Series[bool]
# Add entries here as new blocks are needed.

def _load(module_path: str, fn_name: str) -> Callable | None:
    try:
        mod = importlib.import_module(module_path)
        return getattr(mod, fn_name)
    except (ImportError, AttributeError):
        return None


def _make_registry() -> dict[str, Callable]:
    specs = [
        # triggers
        ("building_blocks.triggers.recent_decline",              "recent_decline"),
        ("building_blocks.triggers.recent_rally",                "recent_rally"),
        ("building_blocks.triggers.sweep_below_low",             "sweep_below_low"),
        ("building_blocks.triggers.breakout_above_high",         "breakout_above_high"),
        ("building_blocks.triggers.volume_spike",                "volume_spike"),
        ("building_blocks.triggers.gap_up",                      "gap_up"),
        ("building_blocks.triggers.gap_down",                    "gap_down"),
        ("building_blocks.triggers.consolidation_then_breakout", "consolidation_then_breakout"),
        ("building_blocks.triggers.breakout_after_accumulation", "breakout_after_accumulation"),
        ("building_blocks.triggers.breakout_from_pullback_range","breakout_from_pullback_range"),
        ("building_blocks.triggers.breakout_volume_confirm",     "breakout_volume_confirm"),
        # structural blocks (W-0322)
        ("building_blocks.structural.trading_range",              "trading_range"),
        ("building_blocks.structural.spring_breach",              "spring_breach"),
        ("building_blocks.structural.sign_of_strength_vol",       "sign_of_strength_vol"),
        # confirmations — new (W-0322)
        # macro-based confirmations (W-0325)
        ("building_blocks.confirmations.fear_greed_extreme",             "fear_greed_extreme"),
        ("building_blocks.confirmations.kimchi_premium_extreme",         "kimchi_premium_extreme"),
        ("building_blocks.confirmations.cvd_absorption",                 "cvd_absorption"),
        ("building_blocks.confirmations.bb_squeeze_adaptive",            "bb_squeeze_adaptive"),
        ("building_blocks.confirmations.oi_price_divergence_long",       "oi_price_divergence_long"),
        ("building_blocks.confirmations.funding_extreme_z",              "funding_extreme_z"),
        ("building_blocks.confirmations.sideways_compression_wyckoff",   "sideways_compression_wyckoff"),
        ("building_blocks.confirmations.reclaim_after_dump_strong",      "reclaim_after_dump_strong"),
        # confirmations — OHLCV-based
        ("building_blocks.confirmations.bollinger_squeeze",       "bollinger_squeeze"),
        ("building_blocks.confirmations.bollinger_expansion",     "bollinger_expansion"),
        ("building_blocks.confirmations.sideways_compression",    "sideways_compression"),
        ("building_blocks.confirmations.volume_dryup",            "volume_dryup"),
        ("building_blocks.confirmations.volume_surge_bull",       "volume_surge_bull"),
        ("building_blocks.confirmations.volume_surge_bear",       "volume_surge_bear"),
        ("building_blocks.confirmations.higher_lows_sequence",    "higher_lows_sequence"),
        ("building_blocks.confirmations.post_dump_compression",   "post_dump_compression"),
        ("building_blocks.confirmations.reclaim_after_dump",      "reclaim_after_dump"),
        ("building_blocks.confirmations.relative_strength_btc",  "relative_strength_btc"),
        ("building_blocks.confirmations.golden_cross",            "golden_cross"),
        ("building_blocks.confirmations.dead_cross",              "dead_cross"),
        ("building_blocks.confirmations.ema_pullback",            "ema_pullback"),
        ("building_blocks.confirmations.atr_ultra_low",           "atr_ultra_low"),
        ("building_blocks.confirmations.absorption_signal",       "absorption_signal"),
        ("building_blocks.confirmations.alt_btc_accel_ratio",     "alt_btc_accel_ratio"),
        ("building_blocks.confirmations.gap_rejection_signal",    "gap_rejection_signal"),
        ("building_blocks.confirmations.intraday_gap_up",         "intraday_gap_up"),
        ("building_blocks.confirmations.liq_zone_squeeze_setup",  "liq_zone_squeeze_setup"),
        ("building_blocks.confirmations.negative_funding_bias",   "negative_funding_bias"),
        ("building_blocks.confirmations.relative_velocity_bull",  "relative_velocity_bull"),
        ("building_blocks.confirmations.return_to_gap_level",     "return_to_gap_level"),
        ("building_blocks.confirmations.smart_money_accumulation","smart_money_accumulation"),
        # confirmations — derivatives-based
        ("building_blocks.confirmations.funding_flip",            "funding_flip"),
        ("building_blocks.confirmations.positive_funding_bias",   "positive_funding_bias"),
        ("building_blocks.confirmations.oi_spike_with_dump",      "oi_spike_with_dump"),
        ("building_blocks.confirmations.oi_hold_after_spike",     "oi_hold_after_spike"),
        ("building_blocks.confirmations.oi_expansion_confirm",    "oi_expansion_confirm"),
        ("building_blocks.confirmations.ls_ratio_recovery",       "ls_ratio_recovery"),
        ("building_blocks.confirmations.oi_change",               "oi_change"),
        ("building_blocks.confirmations.oi_contraction_confirm",  "oi_contraction_confirm"),
        ("building_blocks.confirmations.oi_exchange_divergence",  "oi_exchange_divergence"),
        ("building_blocks.confirmations.oi_price_lag_detect",     "oi_price_lag_detect"),
        ("building_blocks.confirmations.total_oi_spike",          "total_oi_spike"),
        ("building_blocks.confirmations.spot_futures_cvd_divergence", "spot_futures_cvd_divergence"),
        ("building_blocks.confirmations.delta_flip_positive",     "delta_flip_positive"),
        ("building_blocks.confirmations.coinbase_premium_positive","coinbase_premium_positive"),
        ("building_blocks.confirmations.dex_buy_pressure",        "dex_buy_pressure"),
        ("building_blocks.confirmations.holder_concentration_ok", "holder_concentration_ok"),
        # disqualifiers
        ("building_blocks.disqualifiers.extended_from_ma",              "extended_from_ma"),
        ("building_blocks.disqualifiers.extreme_volatility",            "extreme_volatility"),
        ("building_blocks.disqualifiers.cvd_spot_price_divergence_bear","cvd_spot_price_divergence_bear"),
        # entries
        ("building_blocks.entries.rsi_threshold",    "rsi_threshold"),
        ("building_blocks.entries.support_bounce",   "support_bounce"),
        ("building_blocks.entries.bullish_engulfing","bullish_engulfing"),
        ("building_blocks.entries.bearish_engulfing","bearish_engulfing"),
        ("building_blocks.entries.long_lower_wick",  "long_lower_wick"),
        ("building_blocks.entries.long_upper_wick",  "long_upper_wick"),
    ]
    reg: dict[str, Callable] = {}
    for module_path, fn_name in specs:
        fn = _load(module_path, fn_name)
        if fn is not None:
            reg[fn_name] = fn
    return reg


def _funding_extreme_short(ctx: Context) -> pd.Series:
    from building_blocks.confirmations.funding_extreme import funding_extreme
    return funding_extreme(ctx, direction="short_overheat")

def _funding_extreme_long(ctx: Context) -> pd.Series:
    from building_blocks.confirmations.funding_extreme import funding_extreme
    return funding_extreme(ctx, direction="long_overheat")

def _rsi_oversold(ctx: Context) -> pd.Series:
    from building_blocks.entries.rsi_threshold import rsi_threshold
    return rsi_threshold(ctx, threshold=30, direction="below")

def _rsi_overbought(ctx: Context) -> pd.Series:
    from building_blocks.entries.rsi_threshold import rsi_threshold
    return rsi_threshold(ctx, threshold=70, direction="above")


_BASE_REGISTRY: dict[str, Callable] = _make_registry()
# Aliases needed by pattern library
_BASE_REGISTRY["funding_extreme"] = _funding_extreme_long
_BASE_REGISTRY["funding_extreme_short"] = _funding_extreme_short
_BASE_REGISTRY["funding_extreme_long"] = _funding_extreme_long
_BASE_REGISTRY["rsi_oversold"] = _rsi_oversold
_BASE_REGISTRY["rsi_overbought"] = _rsi_overbought
# CBR-specific variant names → map to equivalent general blocks
_BASE_REGISTRY["sideways_compression_cbr"] = _BASE_REGISTRY["sideways_compression"]
_BASE_REGISTRY["consolidation_breakout_cbr"] = _BASE_REGISTRY["consolidation_then_breakout"]
# oi_price_lag_detect_strong → same function, threshold handled internally
_BASE_REGISTRY["oi_price_lag_detect_strong"] = _BASE_REGISTRY["oi_price_lag_detect"]


def _safe_eval(fn: Callable, ctx: Context, name: str) -> pd.Series:
    """Call block function, return all-False on any error."""
    try:
        result = fn(ctx)
        return result.fillna(False).astype(bool)
    except Exception as exc:
        log.debug("Block %s failed: %s", name, exc)
        return pd.Series(False, index=ctx.features.index, dtype=bool)


# ── PatternObjectCombo ────────────────────────────────────────────────────────

@dataclass
class PatternObjectCombo(PatternCombo):
    """Wraps a PatternObject + state machine into the PatternCombo interface."""
    pattern_obj: PatternObject = field(default=None)  # type: ignore

    def __post_init__(self):
        pass

    def _all_block_names(self) -> set[str]:
        """Collect all block names referenced in any phase."""
        names: set[str] = set()
        for phase in self.pattern_obj.phases:
            names.update(phase.required_blocks)
            names.update(phase.optional_blocks)
            names.update(phase.soft_blocks)
            names.update(phase.disqualifier_blocks)
            for group in phase.required_any_groups:
                names.update(group)
        return names

    def fire(self, ctx: Context) -> pd.Series:
        """Run pattern state machine over all bars. Returns entry timestamp Series."""
        block_names = self._all_block_names()
        known = {n: _BASE_REGISTRY[n] for n in block_names if n in _BASE_REGISTRY}
        unknown = block_names - set(known)
        if unknown:
            log.debug("[%s/%s] unknown blocks (will be absent): %s",
                      ctx.symbol, self.pattern_obj.slug, unknown)

        # Compute all block signals (vectorized per-block, then pivot to per-bar)
        block_series: dict[str, pd.Series] = {
            name: _safe_eval(fn, ctx, name)
            for name, fn in known.items()
        }

        sm = PatternStateMachine(self.pattern_obj)
        entry_phase = self.pattern_obj.entry_phase

        entry_flags = pd.Series(False, index=ctx.features.index, dtype=bool)
        last_valid_idx = len(ctx.features) - 2  # exclude last bar (entry at T+1)

        for i, ts in enumerate(ctx.features.index):
            if i > last_valid_idx:
                break
            fired = [name for name, series in block_series.items()
                     if series.iloc[i]]
            ts_aware = ts.to_pydatetime()
            if ts_aware.tzinfo is None:
                ts_aware = ts_aware.replace(tzinfo=timezone.utc)
            transition = sm.evaluate(ctx.symbol, fired, ts_aware)
            if transition and transition.to_phase == entry_phase:
                entry_flags.iloc[i] = True

        return entry_flags


# ── Library combos ─────────────────────────────────────────────────────────────

def _make_combo(pattern_obj: PatternObject) -> PatternObjectCombo:
    return PatternObjectCombo(
        name=pattern_obj.slug,
        direction=pattern_obj.direction,
        pattern_obj=pattern_obj,
    )


def _build_library_combos() -> list[PatternObjectCombo]:
    from patterns.library import (
        TRADOOR_OI_REVERSAL,
        FUNDING_FLIP_REVERSAL,
        WYCKOFF_SPRING_REVERSAL,
        COMPRESSION_BREAKOUT_REVERSAL,
        VOLATILITY_SQUEEZE_BREAKOUT,
        LIQUIDITY_SWEEP_REVERSAL,
        OI_PRESURGE_LONG,
        ALPHA_CONFLUENCE,
        FUNDING_FLIP_SHORT,
        GAP_FADE_SHORT,
        WHALE_ACCUMULATION_REVERSAL,
        ALPHA_PRESURGE,
    )
    patterns = [
        TRADOOR_OI_REVERSAL,
        FUNDING_FLIP_REVERSAL,
        WYCKOFF_SPRING_REVERSAL,
        COMPRESSION_BREAKOUT_REVERSAL,
        VOLATILITY_SQUEEZE_BREAKOUT,
        LIQUIDITY_SWEEP_REVERSAL,
        OI_PRESURGE_LONG,
        ALPHA_CONFLUENCE,
        FUNDING_FLIP_SHORT,
        GAP_FADE_SHORT,
        WHALE_ACCUMULATION_REVERSAL,
        ALPHA_PRESURGE,
    ]
    return [_make_combo(p) for p in patterns]


LIBRARY_COMBOS: list[PatternObjectCombo] = _build_library_combos()
