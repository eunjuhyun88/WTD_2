"""Confirmation: OI expanding while price is still flat.

딸깍 전략 핵심 알파 신호.
OI가 의미있게 올라갔는데 가격이 아직 안 움직인 구간 = 포지션 선취매 기회.

total_oi_spike는 OI 방향만 본다.
oi_price_lag_detect는 OI 상승 + 가격 무반응의 '괴리'를 잡는다.

Feature columns required (from feature_calc):
  - total_oi_change_1h   : multi-exchange aggregate OI % change (1h)
  - close                : klines close (or ctx.features["close"] if mirrored)
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def oi_price_lag_detect(
    ctx: Context,
    *,
    oi_threshold: float = 0.10,
    price_threshold: float = 0.02,
) -> pd.Series:
    """Return True where OI is expanding but price has not yet reacted.

    Args:
        ctx:             Per-symbol Context.
        oi_threshold:    Minimum OI 1h change to qualify (default 10%).
        price_threshold: Maximum absolute price 1h change allowed (default 2%).
                         If price moved more than this, the lag is gone.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.

    Strategy notes:
        - OI↑ ≥ 10% + price flat < 2% → positioning without price discovery
        - This is the pre-ignition zone in OI_PRESURGE_LONG Phase 1
        - Higher oi_threshold = stronger signal, fewer hits
        - Combine with social_sentiment_spike / kol_mention_detect for Phase 2
    """
    if oi_threshold <= 0:
        raise ValueError(f"oi_threshold must be > 0, got {oi_threshold}")
    if price_threshold <= 0:
        raise ValueError(f"price_threshold must be > 0, got {price_threshold}")

    feat = ctx.features

    # OI 1h change (multi-exchange aggregate from fetch_exchange_oi)
    oi_change = feat.get(
        "total_oi_change_1h",
        pd.Series(0.0, index=feat.index),
    ).fillna(0.0)

    # Price 1h change — use pct_change on close if available
    if "close" in feat.columns:
        price_1h = feat["close"].pct_change(1).fillna(0.0)
    else:
        price_1h = pd.Series(0.0, index=feat.index)

    oi_expanding = oi_change >= oi_threshold
    price_flat = price_1h.abs() < price_threshold

    return (oi_expanding & price_flat).astype(bool)
