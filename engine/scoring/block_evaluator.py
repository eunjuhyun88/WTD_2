"""Evaluate all 26 building blocks against a SignalSnapshot.

Returns a list of block names that are active (return True / non-zero)
for the current bar. Used by the /score endpoint to show Jin which
specific patterns are triggering right now.

Building blocks are stateless pure functions(Context) → bool | float.
We wrap them here so failures in one block don't crash the whole response.
"""
from __future__ import annotations

import logging

import pandas as pd

from models.signal import SignalSnapshot
from building_blocks.context import Context

# --- Entries ---
from building_blocks.entries.bullish_engulfing import bullish_engulfing
from building_blocks.entries.bearish_engulfing import bearish_engulfing
from building_blocks.entries.long_lower_wick import long_lower_wick
from building_blocks.entries.long_upper_wick import long_upper_wick
from building_blocks.entries.rsi_threshold import rsi_threshold
from building_blocks.entries.rsi_bullish_divergence import rsi_bullish_divergence
from building_blocks.entries.rsi_bearish_divergence import rsi_bearish_divergence
from building_blocks.entries.support_bounce import support_bounce

# --- Triggers ---
from building_blocks.triggers.recent_rally import recent_rally
from building_blocks.triggers.recent_decline import recent_decline
from building_blocks.triggers.gap_up import gap_up
from building_blocks.triggers.gap_down import gap_down
from building_blocks.triggers.breakout_above_high import breakout_above_high
from building_blocks.triggers.breakout_from_pullback_range import breakout_from_pullback_range
from building_blocks.triggers.breakout_volume_confirm import breakout_volume_confirm
from building_blocks.triggers.consolidation_then_breakout import consolidation_then_breakout
from building_blocks.triggers.volume_spike import volume_spike
from building_blocks.triggers.volume_spike_down import volume_spike_down

# --- Confirmations ---
from building_blocks.confirmations.absorption_signal import absorption_signal
from building_blocks.confirmations.alt_btc_accel_ratio import alt_btc_accel_ratio
from building_blocks.confirmations.golden_cross import golden_cross
from building_blocks.confirmations.dead_cross import dead_cross
from building_blocks.confirmations.ema_pullback import ema_pullback
from building_blocks.confirmations.bollinger_squeeze import bollinger_squeeze
from building_blocks.confirmations.bollinger_expansion import bollinger_expansion
from building_blocks.confirmations.funding_extreme import funding_extreme
from building_blocks.confirmations.funding_flip import funding_flip
from building_blocks.confirmations.higher_lows_sequence import higher_lows_sequence
from building_blocks.confirmations.ls_ratio_recovery import ls_ratio_recovery
from building_blocks.confirmations.oi_change import oi_change
from building_blocks.confirmations.oi_expansion_confirm import oi_expansion_confirm
from building_blocks.confirmations.oi_hold_after_spike import oi_hold_after_spike
from building_blocks.confirmations.oi_spike_with_dump import oi_spike_with_dump
from building_blocks.confirmations.positive_funding_bias import positive_funding_bias
from building_blocks.confirmations.post_dump_compression import post_dump_compression
from building_blocks.confirmations.reclaim_after_dump import reclaim_after_dump
from building_blocks.confirmations.sideways_compression import sideways_compression
from building_blocks.confirmations.cvd_state_eq import cvd_state_eq
from building_blocks.confirmations.delta_flip_positive import delta_flip_positive
from building_blocks.confirmations.volume_dryup import volume_dryup
from building_blocks.confirmations.coinbase_premium_positive import coinbase_premium_positive
from building_blocks.confirmations.smart_money_accumulation import smart_money_accumulation
from building_blocks.confirmations.total_oi_spike import total_oi_spike
from building_blocks.confirmations.oi_exchange_divergence import oi_exchange_divergence
from building_blocks.confirmations.delta_flip_positive import delta_flip_positive

# --- Disqualifiers ---
from building_blocks.disqualifiers.volume_below_average import volume_below_average
from building_blocks.disqualifiers.extreme_volatility import extreme_volatility
from building_blocks.disqualifiers.extended_from_ma import extended_from_ma

log = logging.getLogger("engine.blocks")

# Registry: (display_name, callable(ctx) → bool)
_BLOCKS: list[tuple[str, callable]] = [
    # entries
    ("bullish_engulfing",      bullish_engulfing),
    ("bearish_engulfing",      bearish_engulfing),
    ("long_lower_wick",        long_lower_wick),
    ("long_upper_wick",        long_upper_wick),
    ("rsi_threshold",          rsi_threshold),
    ("rsi_bullish_divergence", rsi_bullish_divergence),
    ("rsi_bearish_divergence", rsi_bearish_divergence),
    ("support_bounce",         support_bounce),
    # triggers
    ("recent_rally",              recent_rally),
    ("recent_decline",            recent_decline),
    ("gap_up",                    gap_up),
    ("gap_down",                  gap_down),
    ("breakout_above_high",       breakout_above_high),
    ("breakout_from_pullback_range", breakout_from_pullback_range),
    ("breakout_volume_confirm",   breakout_volume_confirm),
    ("consolidation_then_breakout", consolidation_then_breakout),
    ("volume_spike",              volume_spike),
    ("volume_spike_down",         volume_spike_down),
    # confirmations
    ("golden_cross",       golden_cross),
    ("dead_cross",         dead_cross),
    ("ema_pullback",       ema_pullback),
    ("bollinger_squeeze",  bollinger_squeeze),
    ("bollinger_expansion", bollinger_expansion),
    ("funding_extreme",    funding_extreme),
    ("funding_extreme_short", lambda ctx: funding_extreme(ctx, direction="short_overheat")),
    ("funding_flip",       funding_flip),
    ("higher_lows_sequence", higher_lows_sequence),
    ("ls_ratio_recovery",  ls_ratio_recovery),
    ("oi_change",          oi_change),
    ("oi_expansion_confirm", oi_expansion_confirm),
    ("oi_hold_after_spike", oi_hold_after_spike),
    ("oi_spike_with_dump", oi_spike_with_dump),
    ("positive_funding_bias", positive_funding_bias),
    ("post_dump_compression", post_dump_compression),
    ("reclaim_after_dump", reclaim_after_dump),
    ("sideways_compression", sideways_compression),
    ("cvd_state_eq",       cvd_state_eq),
    ("cvd_buying",         lambda ctx: cvd_state_eq(ctx, state="buying")),
    ("absorption_signal",  absorption_signal),
    ("delta_flip_positive", delta_flip_positive),
    # VAR-tuned variant: shorter window + looser thresholds for post-climax recovery.
    # After a selling climax the 6-bar rolling sum is dominated by the high-volume
    # climax bar (≈0.48 tbv_ratio), pushing the ratio below 0.55. w=3 + lower
    # to_at_least=0.52 captures the CVD transition in the 12-36h absorption window.
    ("delta_flip_var",      lambda ctx: delta_flip_positive(ctx, window=3, flip_from_below=0.48, flip_to_at_least=0.52)),
    ("alt_btc_accel_ratio", alt_btc_accel_ratio),
    ("volume_dryup",       volume_dryup),
    ("coinbase_premium_positive", coinbase_premium_positive),
    ("smart_money_accumulation", smart_money_accumulation),
    ("total_oi_spike",          total_oi_spike),
    ("oi_exchange_divergence",  oi_exchange_divergence),
    ("delta_flip_positive",     delta_flip_positive),
    # disqualifiers
    ("volume_below_average", volume_below_average),
    ("extreme_volatility",   extreme_volatility),
    ("extended_from_ma",     extended_from_ma),
]


def evaluate_blocks(
    snap: SignalSnapshot,
    features_df: pd.DataFrame,
    klines_df: pd.DataFrame,
) -> list[str]:
    """Return names of all blocks that are active for the last bar.

    Args:
        snap:        The SignalSnapshot for the current bar.
        features_df: Full features DataFrame (from compute_features_table).
        klines_df:   Raw OHLCV DataFrame passed to compute_features_table.

    Returns:
        List of block names that returned True (or non-zero).
    """
    masks = evaluate_block_masks(features_df, klines_df, snap.symbol)
    return [
        name
        for name, mask in masks.items()
        if len(mask) > 0 and bool(mask.iloc[-1])
    ]


def evaluate_block_masks(
    features_df: pd.DataFrame,
    klines_df: pd.DataFrame,
    symbol: str,
) -> dict[str, pd.Series]:
    """Return boolean Series masks for every block over the full features frame."""
    ctx = Context(klines=klines_df, features=features_df, symbol=symbol)
    masks: dict[str, pd.Series] = {}

    for name, fn in _BLOCKS:
        try:
            result = fn(ctx)
            if isinstance(result, pd.Series):
                masks[name] = result.fillna(False).astype(bool).reindex(features_df.index, fill_value=False)
            else:
                masks[name] = pd.Series(
                    [bool(result)] * len(features_df),
                    index=features_df.index,
                    dtype=bool,
                )
        except Exception as exc:
            log.debug("Block %s raised: %s", name, exc)
            masks[name] = pd.Series([False] * len(features_df), index=features_df.index, dtype=bool)

    return masks
