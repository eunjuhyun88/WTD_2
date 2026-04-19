"""Confirmation: Large speculator short positioning is crowded.

Detects when large speculators (retail/momentum traders) are overcommitted to shorts.
High short positioning precedes reversals (shorts get liquidated).
"""
from __future__ import annotations

import logging

import pandas as pd

from building_blocks.context import Context
from research.cot_parser import cot_large_spec_short_pct

log = logging.getLogger(__name__)


def cot_large_spec_short(
    ctx: Context,
    *,
    threshold_pct: float = 65.0,
) -> pd.Series:
    """Return a bool Series where large spec shorts exceed threshold.

    Large speculators (retail) are a contrarian indicator:
    - High short positioning → likely reversal coming
    - Good for bull signal (shorts will cover)

    Args:
        ctx: Per-symbol Context.
        threshold_pct: Trigger when large spec shorts > this % of OI.
            Default 65% (70th percentile historically for BTC/ETH).

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    symbol = ctx.symbol

    try:
        pct = cot_large_spec_short_pct(symbol)
        if pct is None:
            # No COT data available
            return pd.Series(False, index=ctx.features.index)

        # Simple threshold gate: broadcast COT value across all bars in the week
        # (COT is weekly, so same value for all bars in Mon–Sun)
        signal = pct > threshold_pct
        return pd.Series(signal, index=ctx.features.index)

    except Exception as e:
        log.warning(f"COT large spec short block failed for {symbol}: {e}")
        return pd.Series(False, index=ctx.features.index)
