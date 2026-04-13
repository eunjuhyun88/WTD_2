"""L3 — Volume Surge (V-Surge).

Source: Alpha Terminal L3_vsurge()

Compares recent N-bar volume to historical baseline.
Direction-weighted: surge on up-candle = bullish, on down-candle = bearish.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from market_engine.types import LayerResult


def l3_vsurge(df: pd.DataFrame, recent: int = 5, baseline: int = 25) -> LayerResult:
    """
    recent   : bars for 'recent' window
    baseline : bars for 'average' baseline (excluding recent)
    """
    r = LayerResult()
    needed = recent + baseline
    if len(df) < needed:
        r.sig("V-Surge 데이터 부족", "neut")
        return r

    vols   = df["volume"].values
    closes = df["close"].values

    rec_vol  = np.mean(vols[-recent:])
    base_vol = np.mean(vols[-(needed):-recent])

    if base_vol == 0:
        return r

    ratio = rec_vol / base_vol

    # Price direction over the recent window
    price_up = closes[-1] > closes[-(recent+1)]
    direction = 1 if price_up else -1

    # Score table (from HTML L3_vsurge)
    if ratio >= 5.0:
        pts = 15
    elif ratio >= 3.0:
        pts = 10
    elif ratio >= 2.0:
        pts = 7
    elif ratio >= 1.5:
        pts = 4
    elif ratio >= 1.2:
        pts = 2
    else:
        pts = 0

    score = direction * pts

    if score > 0:
        r.sig(f"V-Surge {ratio:.1f}× — 상방 거래량 급증 (+{score})", "bull")
    elif score < 0:
        r.sig(f"V-Surge {ratio:.1f}× — 하방 거래량 급증 ({score})", "bear")
    else:
        r.sig(f"거래량 변화 없음 ({ratio:.2f}×)", "neut")

    r.score = max(-15, min(15, round(score)))
    r.meta.update({"ratio": round(ratio, 2), "direction": "up" if price_up else "down"})
    return r
