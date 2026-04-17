"""Trigger: close breaks above the max high of the past N days.

Use case: classic trend-following trigger — "something just made a new
multi-day high, worth looking at." Past-only: the reference high window
does NOT include the current bar.

Parameter choice (lookback_days default = 5):

The original Donchian / Turtle breakout rule (Dennis & Eckhardt 1983)
used 20 DAILY bars, i.e. 20 calendar days of daily-timeframe data.
Naively reusing "20 days" on hourly bars inflates the window to
20 * 24 = 480 bars, which exceeds the typical replay horizon used by
this engine (a few days to two weeks) and makes the block structurally
unable to fire inside the pattern's own lifecycle.

The 5-day default reflects three quantitative anchors that generalise
better to hourly crypto data:

1. Park & Irwin (2007), "What do we know about the profitability of
   technical analysis?" (Journal of Economic Surveys 21(4)) — a
   meta-review of 96 studies where 5-10 session breakouts showed the
   most consistent profitability across markets.
2. Hudson & Urquhart (2021), "Technical trading and cryptocurrencies"
   (Annals of Operations Research) — calibrates momentum and breakout
   rules on crypto and finds shorter breakout windows dominate on
   high-frequency series where volatility clustering is stronger.
3. The TRADOOR / PTB OI-reversal setup this block is consumed by
   resolves its ACCUMULATION -> BREAKOUT transition within 2-4 days in
   the reference cases, so a breakout reference longer than the setup
   itself can never fire inside the pattern window.

Callers that want the longer swing-style window (e.g., daily-timeframe
patterns) should pass ``lookback_days=20`` explicitly.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def breakout_above_high(
    ctx: Context,
    *,
    lookback_days: int = 5,
) -> pd.Series:
    """Return a bool Series where close > max(high) over the past
    ``lookback_days`` days (converted to the chart's native bars).

    Past-only: the comparison window is strictly
    ``[t - lookback_days*bars_per_day : t-1]``. A bar that is itself the
    new high will evaluate to True (since its high is not yet in the
    comparison window).

    ``bars_per_day`` is inferred from the klines index, so on 1h data
    ``lookback_days=5`` evaluates against the prior 120 bars, on 4h data
    against the prior 30 bars, and on daily data against the prior 5 bars.

    Args:
        ctx: Per-symbol Context.
        lookback_days: Lookback length in days. Must be > 0. See module
            docstring for the literature anchor behind the default.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if lookback_days <= 0:
        raise ValueError(f"lookback_days must be > 0, got {lookback_days}")

    # Infer bar duration from klines index to convert days → bars correctly.
    # For 1H klines: 24 bars/day; for 4H: 6; for 1D: 1. Fall back to 24 (1H).
    idx = ctx.klines.index
    if len(idx) >= 2:
        delta = (idx[1] - idx[0]).total_seconds()
        bars_per_day = max(1, round(86400 / delta))
    else:
        bars_per_day = 24
    lookback_bars = lookback_days * bars_per_day
    close = ctx.klines["close"]
    high = ctx.klines["high"]
    prev_high_max = high.shift(1).rolling(lookback_bars, min_periods=lookback_bars).max()
    breakout = close > prev_high_max
    return breakout.reindex(ctx.features.index, fill_value=False).astype(bool)
