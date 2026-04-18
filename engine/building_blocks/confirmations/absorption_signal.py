"""Confirmation: large net buying (CVD) while price is flat — sell-wall absorption.

Rationale (ALPHA TERMINAL, 2026-04-10):
    "순매수는 엄청난데 가격이 오르지 않으면, 누군가 지정가 매도벽으로 물량 받아먹는 중"
    Translation: "When net buying is huge but price doesn't move, someone is absorbing
    sell-wall orders with limit bids — the wall will exhaust and price will spike."

This block is true while:
    (a) rolling taker-buy ratio over `cvd_window` bars exceeds `cvd_buy_threshold`
        (i.e. takers are aggressively buying), AND
    (b) price change over the same window is < `price_move_threshold`
        (i.e. the buying pressure is NOT moving the price yet).

When both conditions hold the market is in an absorption phase: hidden
accumulation before a squeeze. Used as a soft_block in COMPRESSION and
ENTRY_ZONE phases of FUNDING_FLIP_REVERSAL.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def absorption_signal(
    ctx: Context,
    *,
    cvd_window: int = 5,
    cvd_buy_threshold: float = 0.55,
    price_move_threshold: float = 0.005,
) -> pd.Series:
    """Return a bool Series where large net buying is NOT moving price.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have columns
            ``taker_buy_base_volume``, ``volume``, and ``close``.
        cvd_window: Rolling window (bars) used to aggregate taker buy ratio
            and measure price change. Default 5.
        cvd_buy_threshold: Taker-buy ratio threshold above which buying is
            considered "heavy". Range [0, 1]. Default 0.55 (matches
            cvd_state_eq "buying" threshold in feature_calc).
        price_move_threshold: Maximum fractional price change over the window
            that still qualifies as "price not responding". E.g. 0.005 = 0.5%.
            Default 0.005.

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where absorption
        is detected (heavy buying + flat price).
    """
    if cvd_window < 2:
        raise ValueError(f"cvd_window must be >= 2, got {cvd_window}")
    if not 0.0 < cvd_buy_threshold < 1.0:
        raise ValueError(
            f"cvd_buy_threshold must be in (0, 1), got {cvd_buy_threshold}"
        )
    if price_move_threshold <= 0:
        raise ValueError(
            f"price_move_threshold must be > 0, got {price_move_threshold}"
        )

    tbv = ctx.klines["taker_buy_base_volume"].astype(float)
    vol = ctx.klines["volume"].astype(float)
    close = ctx.klines["close"].astype(float)

    # Rolling taker-buy ratio over the window (treat zero-volume bars as neutral)
    rolling_tbv = tbv.rolling(cvd_window, min_periods=cvd_window).sum()
    rolling_vol = vol.rolling(cvd_window, min_periods=cvd_window).sum()
    tbv_ratio = (rolling_tbv / rolling_vol.replace(0, float("nan"))).fillna(0.5)

    heavy_buying = tbv_ratio >= cvd_buy_threshold

    # Fractional price change over the window: |close[t] - close[t-window]| / close[t-window]
    prev_close = close.shift(cvd_window)
    price_change = ((close - prev_close) / prev_close.replace(0, float("nan"))).abs().fillna(1.0)

    price_flat = price_change < price_move_threshold

    result = heavy_buying & price_flat
    return result.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
