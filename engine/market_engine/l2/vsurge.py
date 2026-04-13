"""L3 — Volume Surge (V-Surge): dollar-volume Z-score.

References:
    [1] Karpoff, J.M. (1987). The relation between price changes and trading
        volume: A survey. Journal of Financial and Quantitative Analysis
        22(1), 109–126.
    [2] Lo, A.W. & Wang, J. (2000). Trading volume: definitions, data analysis,
        and implications of portfolio theory. Review of Financial Studies
        13(2), 257–300.
    [3] Blume, L., Easley, D. & O'Hara, M. (1994). Market statistics and
        technical analysis: The role of volume. Journal of Finance 49(1).

Problem with prior implementation:
    Raw volume comparison (rec_vol / base_vol ratio) is biased by price level.
    BTC at $90,000 and PEPE at $0.000001 have incomparable raw volumes.
    Even for a single asset, raw volume is non-stationary as price trends.

Fix: Dollar-volume normalisation
    dv[i] = volume[i] × close[i]  (USD-denominated per bar)
    Z = (mean(dv_recent) − mean(dv_baseline)) / std(dv_baseline)

    Z-scores are asset-agnostic, scale-invariant, and meaningful across
    different price regimes of the same asset.

Score ∈ [−15, +15]:
    Z ≥ 4σ  : 15 pts (< 0.003% probability under normality)
    Z ≥ 3σ  : 12 pts (< 0.13%)
    Z ≥ 2σ  : 8 pts  (< 2.3%)
    Z ≥ 1.5σ: 5 pts
    Z ≥ 1σ  : 2 pts
    Z < 1σ  : 0 pts (no signal)

    Score = Z_pts × direction (up-candle = +1, down-candle = −1)
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from market_engine.types import LayerResult


def l3_vsurge(df: pd.DataFrame, recent: int = 5, baseline: int = 25) -> LayerResult:
    """Dollar-volume Z-score surge detector.

    Args:
        recent   : bars in the 'signal' window (most recent N bars)
        baseline : bars in the rolling baseline window (excludes recent bars)
    """
    r = LayerResult()
    needed = recent + baseline
    if len(df) < needed:
        r.sig("V-Surge 데이터 부족", "neut")
        return r

    close = df["close"].astype(float).values
    vol   = df["volume"].astype(float).values

    # ── Dollar-volume (USD per bar) ────────────────────────────────────
    dv = vol * close

    rec_dv  = dv[-recent:]
    base_dv = dv[-(recent + baseline):-recent]

    mu_base  = base_dv.mean()
    sig_base = base_dv.std(ddof=1)
    if sig_base < 1.0:
        # Extremely flat volume — likely insufficient data or synthetic bar
        r.sig("V-Surge: 거래량 분산 없음 (신호 불가)", "neut")
        return r

    rec_mean = rec_dv.mean()
    z_score  = (rec_mean - mu_base) / sig_base

    # ── Price direction over the recent window ─────────────────────────
    price_up  = close[-1] > close[-(recent + 1)]
    direction = 1 if price_up else -1

    # ── Score mapping (Z-score → points) ─────────────────────────────
    if z_score >= 4.0:
        pts = 15
    elif z_score >= 3.0:
        pts = 12
    elif z_score >= 2.0:
        pts = 8
    elif z_score >= 1.5:
        pts = 5
    elif z_score >= 1.0:
        pts = 2
    else:
        pts = 0

    score = direction * pts

    if score > 0:
        r.sig(
            f"V-Surge Z={z_score:.1f}σ — 달러볼륨 급증 상방 (+{score})",
            "bull",
        )
    elif score < 0:
        r.sig(
            f"V-Surge Z={z_score:.1f}σ — 달러볼륨 급증 하방 ({score})",
            "bear",
        )
    else:
        r.sig(f"거래량 정상 (Z={z_score:.2f}σ)", "neut")

    r.score = max(-15, min(15, round(score)))
    r.meta.update({
        "z_score":    round(float(z_score), 3),
        "rec_dv_m":   round(float(rec_mean) / 1e6, 3),    # millions USD
        "base_dv_m":  round(float(mu_base)  / 1e6, 3),
        "direction":  "up" if price_up else "down",
    })
    return r
