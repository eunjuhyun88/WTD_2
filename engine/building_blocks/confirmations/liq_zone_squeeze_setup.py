"""Confirmation: Liquidity cluster detected — price is consolidating.

Rationale:
    On crypto futures, traders place limit orders at round numbers and
    support/resistance zones. When price oscillates in a tight range,
    order clusters accumulate in that zone. This liquidity zone persists
    until price breaks out with volume.

    GAP_FADE_SHORT uses this: after a gap up, price rejects if it consolidates
    just above the gap. The tight range indicates liquidity zone at the gap level,
    which sellers will breach to return to fair value.

    Operationally: low(t-lookback to t) near high(t-lookback to t) indicates
    a tight range where orders are stacked.

    Literature:
      - Wyckoff: "accumulation" and "distribution" zones form when price
        oscillates in narrow ranges before breakout.
      - Crypto microstructure: limit order book clustering at round numbers.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def liq_zone_squeeze_setup(
    ctx: Context,
    *,
    lookback_bars: int = 8,
    range_threshold: float = 0.01,
) -> pd.Series:
    """Return a bool Series where price is consolidated in a tight range.

    True when the range (high - low) over the lookback window is <= threshold
    of the current price. Indicates a liquidity cluster / consolidation zone.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have columns
            ``high``, ``low``, ``close``.
        lookback_bars: Number of bars to measure range. Default 8.
        range_threshold: Max range as fraction of current price.
            Default 0.01 (1% range = tight squeeze).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where price
        is in a tight consolidation.
    """
    if lookback_bars < 2:
        raise ValueError(f"lookback_bars must be >= 2, got {lookback_bars}")
    if range_threshold <= 0 or range_threshold >= 1:
        raise ValueError(
            f"range_threshold must be in (0, 1), got {range_threshold}"
        )

    high = ctx.klines["high"].astype(float)
    low = ctx.klines["low"].astype(float)
    close = ctx.klines["close"].astype(float)

    # Range over lookback window
    rolling_high = high.rolling(lookback_bars, min_periods=lookback_bars).max()
    rolling_low = low.rolling(lookback_bars, min_periods=lookback_bars).min()
    range_val = rolling_high - rolling_low

    # Fractional range relative to current price
    frac_range = range_val / close.replace(0, float("nan"))

    # True where range is tight (below threshold)
    squeezed = frac_range <= range_threshold

    return squeezed.reindex(ctx.features.index, fill_value=False).astype(bool)
