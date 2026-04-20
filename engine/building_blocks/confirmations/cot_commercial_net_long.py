"""Confirmation: Commercials (hedgers) are net long.

Detects institutional accumulation. Commercials are sophisticated hedgers
who position for structural trends, not momentum. Their positioning is often
a leading indicator.
"""
from __future__ import annotations

import logging

import pandas as pd

from building_blocks.context import Context
from research.cot_parser import cot_commercial_net_pct

log = logging.getLogger(__name__)


def cot_commercial_net_long(
    ctx: Context,
    *,
    threshold_pct: float = 3.0,
) -> pd.Series:
    """Return a bool Series where commercials are net long.

    Commercials accumulate before major trends. Their net long positioning
    is a bullish signal (institutions are accumulating, not dumping).

    Args:
        ctx: Per-symbol Context.
        threshold_pct: Trigger when commercial net long > this % of OI.
            Default 3% (50th percentile; positive is bullish).

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    symbol = ctx.symbol

    try:
        net_pct = cot_commercial_net_pct(symbol)
        if net_pct is None:
            # No COT data available
            return pd.Series(False, index=ctx.features.index)

        # Broadcast weekly COT value across all bars
        signal = net_pct > threshold_pct
        return pd.Series(signal, index=ctx.features.index)

    except Exception as e:
        log.warning(f"COT commercial net long block failed for {symbol}: {e}")
        return pd.Series(False, index=ctx.features.index)
