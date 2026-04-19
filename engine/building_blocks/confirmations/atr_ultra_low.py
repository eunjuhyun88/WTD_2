"""Confirmation: ATR (volatility) has dropped to extremely low levels.

Rationale:
    Before a large move (up or down), volatility typically compresses into a
    tight range. ATR near the 50-bar low signals a squeeze setup — the market
    is taking a breath before an explosive move. On SHORT setups, ultra-low
    ATR precedes a selling climax + gap fill.

    This is the inverse of bollinger_squeeze: ATR measures absolute range,
    while Bollinger Band width measures normalized volatility.

    Literature:
      - Bollinger (2001): Bollinger Bands and volatility; tight bands precede
        large moves in either direction.
      - Hudson & Urquhart (2021): intraday crypto volatility-normalized measures
        validate compression as a leading indicator.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def atr_ultra_low(
    ctx: Context,
    *,
    atr_window: int = 14,
    lookback_bars: int = 50,
    percentile_threshold: float = 0.15,
) -> pd.Series:
    """Return a bool Series where ATR is in the lower 15th percentile over 50 bars.

    True when current ATR is extremely compressed relative to recent history,
    indicating a volatility squeeze setup.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have columns
            ``high``, ``low``, ``close``.
        atr_window: Period for ATR calculation (bars). Default 14 (standard).
        lookback_bars: Historical window for percentile calculation. Default 50.
        percentile_threshold: Percentile below which ATR is "ultra-low".
            Default 0.15 (15th percentile, bottom 15% of recent range).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where ATR is
        in the lower percentile (compression zone).
    """
    if atr_window < 2:
        raise ValueError(f"atr_window must be >= 2, got {atr_window}")
    if lookback_bars < atr_window:
        raise ValueError(
            f"lookback_bars must be >= atr_window, got {lookback_bars} vs {atr_window}"
        )
    if not 0.0 < percentile_threshold < 1.0:
        raise ValueError(
            f"percentile_threshold must be in (0, 1), got {percentile_threshold}"
        )

    high = ctx.klines["high"].astype(float)
    low = ctx.klines["low"].astype(float)
    close = ctx.klines["close"].astype(float)

    # Calculate True Range
    # TR = max(H - L, |H - close[t-1]|, |L - close[t-1]|)
    hl_range = high - low
    h_prev_close = (high - close.shift(1)).abs()
    l_prev_close = (low - close.shift(1)).abs()
    tr = pd.concat([hl_range, h_prev_close, l_prev_close], axis=1).max(axis=1)

    # Calculate ATR (rolling mean of TR)
    atr = tr.rolling(atr_window, min_periods=atr_window).mean()

    # Calculate rolling percentile of ATR over lookback_bars
    atr_percentile = atr.rolling(lookback_bars, min_periods=lookback_bars).apply(
        lambda x: pd.Series(x).rank(pct=True).iloc[-1], raw=False
    )

    # True where current ATR is in bottom percentile
    ultra_low = atr_percentile <= percentile_threshold

    return ultra_low.reindex(ctx.features.index, fill_value=False).astype(bool)
