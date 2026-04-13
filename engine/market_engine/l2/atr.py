"""L15 — ATR Volatility State + Auto Stop-Loss.

Source: Alpha Terminal L15_atr()

Classifies current volatility into 5 tiers and computes
ATR-based stop-loss / take-profit levels.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from market_engine.types import LayerResult

_ATR_PERIOD = 14


def _atr_series(df: pd.DataFrame, period: int) -> pd.Series:
    prev = df["close"].shift(1)
    tr = pd.concat([
        (df["high"] - df["low"]).abs(),
        (df["high"] - prev).abs(),
        (df["low"]  - prev).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1.0 / period, adjust=False).mean()


def l15_atr(df: pd.DataFrame, period: int = _ATR_PERIOD) -> LayerResult:
    r = LayerResult()
    if len(df) < period + 2:
        r.sig("ATR 데이터 부족", "neut")
        return r

    atr_s  = _atr_series(df, period)
    atr    = atr_s.iloc[-1]
    close  = df["close"].iloc[-1]
    atr_pct = atr / close * 100

    # ── Volatility tier ───────────────────────────────────────────────────
    if atr_pct < 1.0:
        tier = "ULTRA_LOW"
        r.score += 5
        r.sig(f"ATR {atr_pct:.2f}% — ULTRA LOW (코일 직전 +5)", "bull")
    elif atr_pct < 2.5:
        tier = "LOW"
        r.score += 2
        r.sig(f"ATR {atr_pct:.2f}% — LOW", "neut")
    elif atr_pct < 5.0:
        tier = "NORMAL"
        r.sig(f"ATR {atr_pct:.2f}% — NORMAL", "neut")
    elif atr_pct < 10.0:
        tier = "HIGH"
        r.score -= 3
        r.sig(f"ATR {atr_pct:.2f}% — HIGH (변동성 주의 -3)", "warn")
    else:
        tier = "EXTREME"
        r.score -= 8
        r.sig(f"ATR {atr_pct:.2f}% — EXTREME (과열 위험 -8)", "warn")

    # ── Auto levels ───────────────────────────────────────────────────────
    stop_long   = round(close - 1.5 * atr, 6)
    stop_short  = round(close + 1.5 * atr, 6)
    tp1_long    = round(close + 2.0 * atr, 6)
    tp2_long    = round(close + 3.0 * atr, 6)
    tp1_short   = round(close - 2.0 * atr, 6)

    r.meta.update({
        "atr":        round(float(atr), 6),
        "atr_pct":    round(float(atr_pct), 3),
        "tier":       tier,
        "stop_long":  stop_long,
        "stop_short": stop_short,
        "tp1_long":   tp1_long,
        "tp2_long":   tp2_long,
        "tp1_short":  tp1_short,
    })
    r.score = max(-10, min(8, round(r.score)))
    return r
