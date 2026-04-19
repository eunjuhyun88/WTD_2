"""Confirmation: cumulative volume delta (CVD) diverges bearishly from price.

Rationale (Signal Radar v4.0 Fakeout Filter, 2026-04-19):
    Original JS: ``price >= maxPrice * 0.999 AND cvd < maxCvd * 0.8``
    Translation: "Price is near its recent high BUT the running CVD has already
    rolled over from its peak — the price breakout is not supported by genuine
    net buying. Flag as a fakeout."

When this block fires, the price move looks bullish but order-flow is
declining — typical of distribution or stop-hunt patterns. Used as a
``disqualifier_block`` in Signal Radar-derived patterns to suppress entries
on fake breakouts.

CVD is computed per-bar as:
    cvd_delta[t] = taker_buy_base_volume[t] - (volume[t] - taker_buy_base_volume[t])
    cvd[t] = cumsum(cvd_delta)

The running CVD peak and the price high are both measured over ``lookback`` bars.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def cvd_price_divergence(
    ctx: Context,
    *,
    price_lookback: int = 20,
    cvd_drop_ratio: float = 0.80,
    price_near_pct: float = 0.999,
) -> pd.Series:
    """Return True where price is near its recent high but CVD has rolled over.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have columns
            ``close``, ``volume``, ``taker_buy_base_volume``.
        price_lookback: Rolling window (bars) for the price high and CVD peak.
            Default 20 (Signal Radar original: dynamic max-price window).
        cvd_drop_ratio: CVD must have fallen below this fraction of its rolling
            peak to qualify as divergent. Default 0.80 (Signal Radar: 0.8×maxCvd).
        price_near_pct: Fraction of rolling high that counts as "near high".
            Default 0.999 (Signal Radar: price >= maxPrice * 0.999).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where fakeout
        divergence is detected (price at high, CVD declining).
    """
    if price_lookback < 2:
        raise ValueError(f"price_lookback must be >= 2, got {price_lookback}")
    if not 0.0 < cvd_drop_ratio < 1.0:
        raise ValueError(f"cvd_drop_ratio must be in (0, 1), got {cvd_drop_ratio}")
    if not 0.0 < price_near_pct <= 1.0:
        raise ValueError(f"price_near_pct must be in (0, 1], got {price_near_pct}")

    close = ctx.klines["close"].astype(float)
    tbv = ctx.klines["taker_buy_base_volume"].astype(float)
    vol = ctx.klines["volume"].astype(float)

    # Running CVD: net taker buy volume (positive = net buying)
    cvd_delta = tbv - (vol - tbv)
    cvd = cvd_delta.cumsum()

    # Price at or near the rolling high
    rolling_high = close.rolling(price_lookback, min_periods=price_lookback).max()
    price_near_high = close >= rolling_high * price_near_pct

    # CVD has fallen from its rolling peak
    cvd_peak = cvd.rolling(price_lookback, min_periods=price_lookback).max()
    # Guard against negative CVD peaks (persistent net-selling environment)
    # — only flag divergence when the peak was itself positive (accumulation phase)
    cvd_declining = (cvd < cvd_peak * cvd_drop_ratio) & (cvd_peak > 0)

    result = price_near_high & cvd_declining
    return result.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
