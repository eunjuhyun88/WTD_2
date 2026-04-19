"""Trigger: current bar's low breaks below the N-day prior low but closes above it.

Detects a liquidity sweep / stop hunt: market makers push price below a
key support level to clear stop-loss orders clustered there, then reverse
intrabar. The bar signals this as: ``low < prior_low`` (breach) AND
``close > prior_low`` (recovery).

This is the key structural signal for the Liquidity Sweep Reversal (LSR)
pattern, which is distinct from Wyckoff Spring (WSR, W-0100):
  - WSR requires a prior compression zone, then a spring from it.
  - LSR fires immediately on the sweep+recovery candle — no compression
    required. Faster-cycling, higher-frequency pattern.

Literature anchors:
  Wyckoff (1931) "The Richard D. Wyckoff Method of Trading in Stocks":
    The "Spring" is a shakeout below support to flush weak holders before
    a markup. LSR is the standalone-sweep simplification of this concept.

  Murphy (1999) "Technical Analysis of the Financial Markets" §6:
    Support levels are formed by stop orders clustering below prior lows.
    A sweep is a coordinated move to trigger those stops, creating
    intraday liquidity for institutional entries.

  Koutmos (2019) "Return and volatility spillovers among cryptocurrencies":
    Crypto markets show higher stop-cluster density around round numbers
    and prior lows due to retail fragmentation — making liquidity sweeps
    more prevalent and more abrupt than in traditional markets.

Parameter design (lookback_days=3, min_sweep_pct=0.001):
  Lookback 3 days (72h on 1h bars) covers typical short-term
  support/resistance formation. Hudson & Urquhart (2021) validate 3–5
  day rolling windows as the effective short-term momentum lookback on
  crypto hourly data.

  min_sweep_pct=0.001 (0.1%) filters micro-wicks from spread noise:
  any breach smaller than 0.1% of the reference level is likely noise
  from wide bid-ask spreads rather than a genuine stop-hunt. On BTC at
  $60,000 this translates to a $60 minimum sweep depth.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def sweep_below_low(
    ctx: Context,
    *,
    lookback_days: int = 3,
    min_sweep_pct: float = 0.001,
) -> pd.Series:
    """Return True where the bar's low breaks below the N-day prior low
    and the close recovers back above it.

    The combination ``low < prior_low AND close > prior_low`` identifies
    the classic liquidity sweep candle: a brief spike below support that
    closes above it, trapping shorts and clearing stop-loss orders of longs.

    Args:
        ctx: Per-symbol Context.
        lookback_days: Rolling low window in days (default 3). Bars-per-day
            is inferred from the klines index: 3 days = 72 bars on 1h data,
            18 bars on 4h, 3 bars on 1d, etc.
        min_sweep_pct: Minimum sweep depth as a fraction of prior_low
            (default 0.001 = 0.1%). Filters micro-wicks from spread noise.

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True at sweep bars.
    """
    if lookback_days <= 0:
        raise ValueError(f"lookback_days must be > 0, got {lookback_days}")
    if min_sweep_pct < 0:
        raise ValueError(f"min_sweep_pct must be >= 0, got {min_sweep_pct}")

    idx = ctx.klines.index
    if len(idx) >= 2:
        delta = (idx[1] - idx[0]).total_seconds()
        bars_per_day = max(1, round(86400 / delta))
    else:
        bars_per_day = 24
    lookback_bars = lookback_days * bars_per_day

    low = ctx.klines["low"]
    close = ctx.klines["close"]
    prior_low = low.shift(1).rolling(lookback_bars, min_periods=lookback_bars).min()

    breach = (prior_low - low) >= min_sweep_pct * prior_low
    recovery = close > prior_low

    signal = breach & recovery
    return signal.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
