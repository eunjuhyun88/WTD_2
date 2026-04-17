"""Trigger: Wyckoff-style Sign-of-Strength — close breaks above the high
of the rally since the most recent pullback low.

Unlike ``breakout_above_high`` which references a fixed rolling window,
this block is *phase-anchored*: the reference high is reset every time
price makes a new rolling low within ``lookback_bars``. The intent
mirrors the Wyckoff Sign-of-Strength definition (Wyckoff 1911,
republished Pruden 2007 *The Three Skills of Top Trading*; Weis &
Wyckoff 2013 *Trades About to Happen*): after an accumulation range
prints its Spring / bottom, a Sign-of-Strength is a close that breaks
above the highs made *since that low*, not some external calendar
high.

Operational definition:

1. ``rolling_low_t`` = min(low) over the prior ``lookback_bars`` bars.
2. Whenever ``low_t == rolling_low_t`` (a new rolling low is made), the
   reference is reset to start from bar ``t``.
3. Between resets, the reference is the cumulative max of ``high`` since
   the last reset, shifted by one bar (past-only).
4. Require ``(rally_high - rolling_low) / rolling_low >= min_drawdown``
   so the pullback has non-trivial depth — we are confirming a breakout
   from a real range, not a grind-up.
5. Return ``close > reference_high`` on bars that pass (3) and (4).

Parameter choice anchors:

- ``lookback_bars=72`` (≈3 days on 1h): matches the post-dump recovery
  horizon observed on TRADOOR-style perpetual-swap V-reversals (Park,
  Hahn & Lee 2023 "Liquidation cascades on crypto perpetuals"), and
  short enough that the range reference stays local to the current
  setup rather than drifting back into pre-dump regime.
- ``min_drawdown=0.05`` (5%): filters out grind-up breakouts where the
  "pullback" is less than typical intraday noise. 5% is aligned with
  Baur & Dimpfl (2018) *Asymmetric volatility in cryptocurrencies*
  classification of "significant" intraday crypto moves.

Why this block exists:

The ``breakout_above_high`` module-level dead-end analysis on the TRADOOR
OI-reversal benchmark pack (W-0086) found that rolling-window breakouts
catch the pre-dump final rally, not the post-accumulation breakout, and
that a 5-day rolling reference is structurally incompatible with the
2-7 day crypto perp whale-squeeze cycle. This block is the
architectural fix: anchor the breakout reference to the phase, not to
the calendar.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def breakout_from_pullback_range(
    ctx: Context,
    *,
    lookback_bars: int = 72,
    min_drawdown: float = 0.05,
) -> pd.Series:
    """Return a bool Series where close breaks above the rally high since
    the most recent rolling low, provided the pullback has depth >=
    ``min_drawdown``.

    See the module docstring for the literature anchor and rationale.
    """
    if lookback_bars <= 0:
        raise ValueError(f"lookback_bars must be > 0, got {lookback_bars}")
    if min_drawdown <= 0:
        raise ValueError(f"min_drawdown must be > 0, got {min_drawdown}")

    low = ctx.klines["low"]
    high = ctx.klines["high"]
    close = ctx.klines["close"]

    rolling_low = low.rolling(lookback_bars, min_periods=1).min()
    # Start a new "rally regime" every time today's low matches the
    # rolling min (new pullback low printed).
    is_new_low = low <= rolling_low
    regime_id = is_new_low.cumsum()

    # Within each regime, the reference high is cumulative max of `high`
    # up to t-1 (past-only).
    rally_high = high.groupby(regime_id).cummax().shift(1)

    # Depth of the pullback relative to the regime's rolling_low.
    drawdown = (rally_high - rolling_low) / rolling_low.replace(0, pd.NA)
    has_depth = drawdown >= min_drawdown

    sos = (close > rally_high) & has_depth
    return sos.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
