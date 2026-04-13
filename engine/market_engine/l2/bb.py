"""L14 / S16 — Bollinger Band Squeeze.

Two variants:
  l14_bb   : Relative squeeze — compares current bandwidth to 20/50 bars ago.
             Signals a volatility coil (squeeze → expansion).
             Source: Alpha Terminal L14_bb()

  s16_bb   : Absolute squeeze — bandwidth < 3.5% threshold directly.
             Source: Alpha Hunter S16_bbSqueeze()

Both use period=20, mult=2.0 (standard Bollinger).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from market_engine.types import LayerResult

_BB_PERIOD = 20
_BB_MULT   = 2.0


def _bandwidth(close: pd.Series, period: int, mult: float) -> pd.Series:
    mid = close.rolling(period).mean()
    std = close.rolling(period).std(ddof=1)
    upper = mid + mult * std
    lower = mid - mult * std
    return (upper - lower) / mid * 100   # % bandwidth


def l14_bb(df: pd.DataFrame, period: int = _BB_PERIOD, mult: float = _BB_MULT) -> LayerResult:
    """Relative BB squeeze: compare current BW to historical BW."""
    r = LayerResult()
    close = df["close"]
    if len(close) < period + 50:
        r.sig("BB 데이터 부족", "neut")
        return r

    bw = _bandwidth(close, period, mult)
    cur_bw     = bw.iloc[-1]
    bw_20ago   = bw.iloc[-21] if len(bw) > 20 else cur_bw
    bw_50ago   = bw.iloc[-51] if len(bw) > 50 else cur_bw

    shrink_20  = (bw_20ago - cur_bw) / (bw_20ago + 1e-9) * 100
    shrink_50  = (bw_50ago - cur_bw) / (bw_50ago + 1e-9) * 100

    if shrink_50 >= 50:
        r.score += 20
        r.sig(f"BB BigSqueeze — 50봉 대비 {shrink_50:.0f}% 수축 (+20)", "bull")
    elif shrink_20 >= 35:
        r.score += 12
        r.sig(f"BB Squeeze — 20봉 대비 {shrink_20:.0f}% 수축 (+12)", "bull")
    elif shrink_20 >= 15:
        r.score += 6
        r.sig(f"BB 수축 중 — {shrink_20:.0f}% 수축 (+6)", "bull")
    else:
        r.sig(f"BB 정상 — 현재 BW {cur_bw:.2f}%", "neut")

    # Expansion after squeeze (BW widening rapidly) → breakout confirmed
    if shrink_20 < -30:
        r.score -= 5
        r.sig("BB 확장 — 변동성 폭발 (방향 확인 필요)", "warn")

    r.meta.update({
        "cur_bw":    round(float(cur_bw), 3),
        "bw_20ago":  round(float(bw_20ago), 3),
        "bw_50ago":  round(float(bw_50ago), 3),
        "shrink_20": round(float(shrink_20), 1),
        "shrink_50": round(float(shrink_50), 1),
    })
    r.score = max(-15, min(20, round(r.score)))
    return r


def s16_bb(df: pd.DataFrame, threshold_pct: float = 3.5) -> LayerResult:
    """Absolute BB squeeze: BW < threshold% → coil signal."""
    r = LayerResult()
    close = df["close"]
    if len(close) < _BB_PERIOD:
        r.sig("BB 데이터 부족", "neut")
        return r

    bw = _bandwidth(close, _BB_PERIOD, _BB_MULT)
    cur_bw = bw.iloc[-1]

    r.meta["bandwidth"] = round(float(cur_bw), 3)

    if cur_bw < 1.5:
        r.score += 18
        r.sig(f"BB ULTRA Squeeze {cur_bw:.2f}% < 1.5% (+18)", "bull")
    elif cur_bw < threshold_pct:
        r.score += 10
        r.sig(f"BB Squeeze {cur_bw:.2f}% < {threshold_pct}% (+10)", "bull")
    else:
        r.sig(f"BB 정상 {cur_bw:.2f}%", "neut")

    r.score = max(0, min(20, round(r.score)))
    return r
