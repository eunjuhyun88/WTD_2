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
from building_blocks.triggers.consolidation_then_breakout import consolidation_then_breakout
from building_blocks.triggers.volume_spike import volume_spike

# --- Confirmations ---
from building_blocks.confirmations.golden_cross import golden_cross
from building_blocks.confirmations.dead_cross import dead_cross
from building_blocks.confirmations.ema_pullback import ema_pullback
from building_blocks.confirmations.bollinger_squeeze import bollinger_squeeze
from building_blocks.confirmations.bollinger_expansion import bollinger_expansion
from building_blocks.confirmations.funding_extreme import funding_extreme
from building_blocks.confirmations.oi_change import oi_change
from building_blocks.confirmations.cvd_state_eq import cvd_state_eq
from building_blocks.confirmations.volume_dryup import volume_dryup

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
    ("consolidation_then_breakout", consolidation_then_breakout),
    ("volume_spike",              volume_spike),
    # confirmations
    ("golden_cross",       golden_cross),
    ("dead_cross",         dead_cross),
    ("ema_pullback",       ema_pullback),
    ("bollinger_squeeze",  bollinger_squeeze),
    ("bollinger_expansion", bollinger_expansion),
    ("funding_extreme",    funding_extreme),
    ("oi_change",          oi_change),
    ("cvd_state_eq",       cvd_state_eq),
    ("volume_dryup",       volume_dryup),
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
    ctx = Context(klines=klines_df, features=features_df, symbol=snap.symbol)
    active: list[str] = []

    for name, fn in _BLOCKS:
        try:
            result = fn(ctx)
            # Blocks return pd.Series (vectorised over features_df).
            # We only care about the last bar — the current signal bar.
            if isinstance(result, pd.Series):
                result = bool(result.iloc[-1]) if len(result) > 0 else False
            if result:
                active.append(name)
        except Exception as exc:
            log.debug("Block %s raised: %s", name, exc)

    return active
