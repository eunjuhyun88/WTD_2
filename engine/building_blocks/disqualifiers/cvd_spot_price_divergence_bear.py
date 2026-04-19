"""Disqualifier: taker buy flow is rising while price is falling (bearish divergence).

Rationale:
    When taker buy ratio (tbv / volume) trends upward over ``lookback`` bars but
    price declines over the same window, the ostensible "buying" is being absorbed
    by the sell side — a hallmark of institutional distribution. We reject long
    entries in this environment.

Detection logic:
    tbv_ratio[t]  = taker_buy_base_volume[t] / volume[t]   (per bar)
    rising_flow   = tbv_ratio.rolling(lookback).mean() > net_buy_threshold
    falling_price = close.pct_change(lookback) < -min_price_drop

    Disqualify = rising_flow AND falling_price sustained for ``min_bars`` bars.

Differences from cvd_price_divergence:
    ``cvd_price_divergence`` catches fakeout breakouts (price near high, CVD
    rolling over). This block catches the opposite: price already *falling* while
    flow looks healthy — absorption / hidden selling phase.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def cvd_spot_price_divergence_bear(
    ctx: Context,
    *,
    lookback: int = 10,
    net_buy_threshold: float = 0.50,
    min_price_drop: float = 0.003,
    min_bars: int = 2,
) -> pd.Series:
    """Return True where taker buy flow is rising while price is falling.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have ``close``,
            ``volume``, and ``taker_buy_base_volume``.
        lookback: Rolling window (bars) for flow average and price change.
            Default 10 (≈ half a session on 1 h bars).
        net_buy_threshold: tbv_ratio rolling mean must exceed this to be
            considered "rising flow". Default 0.50 (net buy majority).
        min_price_drop: Price pct_change(lookback) must be below this
            *negative* threshold to flag price as falling.
            Default 0.003 = price down ≥ 0.3% over the window.
        min_bars: Minimum consecutive bars the divergence must persist to
            trigger the disqualifier. Default 2.

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True = disqualify.
    """
    if lookback < 2:
        raise ValueError(f"lookback must be >= 2, got {lookback}")
    if not 0.0 < net_buy_threshold < 1.0:
        raise ValueError(f"net_buy_threshold must be in (0, 1), got {net_buy_threshold}")
    if min_price_drop < 0:
        raise ValueError(f"min_price_drop must be >= 0, got {min_price_drop}")
    if min_bars < 1:
        raise ValueError(f"min_bars must be >= 1, got {min_bars}")

    close = ctx.klines["close"].astype(float)
    tbv = ctx.klines["taker_buy_base_volume"].astype(float)
    vol = ctx.klines["volume"].astype(float)

    # Per-bar taker buy ratio; guard against zero volume
    safe_vol = vol.replace(0, float("nan"))
    tbv_ratio = (tbv / safe_vol).fillna(0.5)

    # Rolling average of taker buy ratio over lookback bars
    flow_avg = tbv_ratio.rolling(lookback, min_periods=lookback).mean()
    rising_flow = flow_avg > net_buy_threshold

    # Price change over the same window
    price_chg = close.pct_change(lookback)
    falling_price = price_chg < -min_price_drop

    # Raw divergence signal
    divergence = rising_flow & falling_price

    # Require min_bars consecutive bars of divergence
    if min_bars <= 1:
        sustained = divergence
    else:
        sustained = (
            divergence.rolling(min_bars, min_periods=min_bars).sum() >= min_bars
        ).astype(bool)

    return sustained.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
