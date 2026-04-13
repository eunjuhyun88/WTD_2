"""L11 — Cumulative Volume Delta (candle-based).

CVD = cumsum(buyVol×2 - totalVol)   for each candle.
Equivalent to: buyVol - sellVol accumulated.

Detects:
  - Trend divergence: price making new highs but CVD falling → weak
  - Absorption:       price flat + strong one-directional CVD
  - Distribution:     price at highs + CVD declining sharply

Input: DataFrame with columns 'close', 'volume', 'taker_buy_base_volume'
       (taker_buy_base_volume is the standard Binance klines field)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from market_engine.types import LayerResult


def l11_cvd(df: pd.DataFrame) -> LayerResult:
    r = LayerResult()
    if len(df) < 10:
        r.sig("데이터 부족", "neut")
        return r

    total_vol = df["volume"] * df["close"]
    if "taker_buy_base_volume" in df.columns:
        buy_vol = df["taker_buy_base_volume"] * df["close"]
    else:
        # Fallback: assume 50/50 split (zero net CVD signal but at least no crash)
        buy_vol = total_vol * 0.5
    delta     = buy_vol * 2 - total_vol
    cvd       = delta.cumsum()

    last_cvd   = cvd.iloc[-1]
    max_price  = df["close"].max()
    max_cvd    = cvd.max()
    cur_price  = df["close"].iloc[-1]

    # ── Divergence: price at new high but CVD below 80% of its peak ───────
    at_price_high = cur_price >= max_price * 0.999
    cvd_lagging   = last_cvd < max_cvd * 0.80

    if at_price_high and cvd_lagging:
        r.score -= 12
        r.sig(f"CVD 다이버전스 — 가격 신고가({cur_price:.4f}) + CVD 후퇴 (-12)", "bear")
        r.meta["divergence"] = True
    else:
        r.meta["divergence"] = False

    # ── Absorption: price range-bound + CVD > 30% of total volume ─────────
    price_pct_range = (df["close"].max() - df["close"].min()) / df["close"].mean()
    cvd_magnitude   = abs(last_cvd) / (total_vol.sum() + 1e-9)
    is_flat         = price_pct_range < 0.05

    if is_flat and cvd_magnitude > 0.30:
        if last_cvd > 0:
            r.score += 10
            r.sig(f"흡수 감지 — 횡보 중 강한 매수 CVD (+10)", "bull")
        else:
            r.score -= 8
            r.sig(f"분산 감지 — 횡보 중 강한 매도 CVD (-8)", "bear")
        r.meta["absorption"] = True
    else:
        r.meta["absorption"] = False

    # ── Raw CVD trend (last 10 vs previous 10) ────────────────────────────
    if len(cvd) >= 20:
        recent_mean = cvd.iloc[-10:].mean()
        prior_mean  = cvd.iloc[-20:-10].mean()
        if recent_mean > prior_mean * 1.1:
            r.score += 5
            r.sig("CVD 상승 추세 (+5)", "bull")
        elif recent_mean < prior_mean * 0.9:
            r.score -= 5
            r.sig("CVD 하락 추세 (-5)", "bear")

    r.meta.update({
        "last_cvd":   round(float(last_cvd), 2),
        "max_cvd":    round(float(max_cvd), 2),
        "cvd_series": cvd.round(2).tolist()[-20:],   # last 20 for charting
    })
    r.score = max(-20, min(20, round(r.score)))
    return r
