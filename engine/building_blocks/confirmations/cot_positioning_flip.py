"""Confirmation: Large speculator positioning flips from net-short to net-long.

Detects sentiment reversal. When retail speculators flip from oversold to
overbought, it signals a turn in momentum. WoW (week-over-week) comparison.
"""
from __future__ import annotations

import logging
from datetime import timedelta

import pandas as pd

from building_blocks.context import Context
from research.cot_parser import fetch_cot_report

log = logging.getLogger(__name__)


def cot_positioning_flip(
    ctx: Context,
    *,
    weeks_back: int = 1,
) -> pd.Series:
    """Return a bool Series where large specs flip from net-short to net-long.

    Measures: (large_spec_long - large_spec_short) WoW increase.
    If current week > previous week, it's a bullish flip.

    Args:
        ctx: Per-symbol Context.
        weeks_back: Look back N weeks for comparison (default 1 = prior week).

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    symbol = ctx.symbol

    try:
        # Current week's COT
        current_cot = fetch_cot_report(symbol, week_ago=0)
        if not current_cot or current_cot["oi_total"] == 0:
            return pd.Series(False, index=ctx.features.index)

        # Previous week's COT
        previous_cot = fetch_cot_report(symbol, week_ago=weeks_back)
        if not previous_cot or previous_cot["oi_total"] == 0:
            return pd.Series(False, index=ctx.features.index)

        # Compute net positioning (long - short)
        current_net = (
            current_cot["large_spec_long"] - current_cot["large_spec_short"]
        )
        previous_net = (
            previous_cot["large_spec_long"] - previous_cot["large_spec_short"]
        )

        # Flip detected: current > previous (bullish shift)
        flip = current_net > previous_net

        # Broadcast weekly signal across all bars
        return pd.Series(flip, index=ctx.features.index)

    except Exception as e:
        log.warning(f"COT positioning flip block failed for {symbol}: {e}")
        return pd.Series(False, index=ctx.features.index)
