"""Confirmation: Gap rejection detected (price reverses from gap high).

Rationale:
    After a gap up, if price rapidly rejects (forms a lower close or closes below
    the open), it signals buyers are weak and the gap will likely fade. This is
    the signal to prepare for a gap-fill short.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def gap_rejection_signal(
    ctx: Context,
    *,
    lookback_bars: int = 3,
) -> pd.Series:
    """Return a bool Series where gap is rejected (closes below open).

    True when price closes below its open within lookback_bars, indicating
    rejection of the gap move and buyer weakness.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have columns
            ``open``, ``close``, ``high``.
        lookback_bars: Window to check for rejection (default 3 bars).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where rejection
        is detected.
    """
    if lookback_bars < 1:
        raise ValueError(f"lookback_bars must be >= 1, got {lookback_bars}")

    open_ = ctx.klines["open"].astype(float)
    close = ctx.klines["close"].astype(float)
    high = ctx.klines["high"].astype(float)

    # Check if any recent bar is a rejection candle (close < open)
    rejection = False
    for i in range(lookback_bars):
        rejection = rejection | (close.shift(i) < open_.shift(i))

    return rejection.reindex(ctx.features.index, fill_value=False).astype(bool)
