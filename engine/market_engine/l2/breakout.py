"""L13 — Breakout Detection (7d / 30d high-low).

Source: Alpha Terminal L13_breakout()

Detects:
  - New 7d / 30d high or low
  - Range position % (where is current price in the 30d range)
  - Consolidation breakout confirmation
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from market_engine.types import LayerResult


def l13_breakout(df_1h: pd.DataFrame) -> LayerResult:
    """df_1h: hourly OHLCV, recent last."""
    r = LayerResult()
    n = len(df_1h)
    if n < 24:
        r.sig("데이터 부족 (24H 이상 필요)", "neut")
        return r

    close = df_1h["close"]
    cur   = float(close.iloc[-1])

    # ── 7-day window (168 1H bars) ────────────────────────────────────────
    w7   = min(168, n)
    hi7  = float(df_1h["high"].iloc[-w7:].max())
    lo7  = float(df_1h["low"].iloc[-w7:].min())

    # ── 30-day window (720 1H bars) ───────────────────────────────────────
    w30  = min(720, n)
    hi30 = float(df_1h["high"].iloc[-w30:].max())
    lo30 = float(df_1h["low"].iloc[-w30:].min())

    # ── Range position % ──────────────────────────────────────────────────
    range30 = hi30 - lo30
    pos_pct = (cur - lo30) / (range30 + 1e-12) * 100  # 0 = bottom, 100 = top

    # ── Breakout signals ──────────────────────────────────────────────────
    broke_7d_high  = cur >= hi7  * 0.998
    broke_7d_low   = cur <= lo7  * 1.002
    broke_30d_high = cur >= hi30 * 0.998
    broke_30d_low  = cur <= lo30 * 1.002

    if broke_30d_high:
        r.score += 18
        r.sig(f"30일 신고가 돌파 — ${cur:.4f} ≥ ${hi30:.4f} (+18)", "bull")
    elif broke_7d_high:
        r.score += 10
        r.sig(f"7일 신고가 돌파 — ${cur:.4f} ≥ ${hi7:.4f} (+10)", "bull")

    if broke_30d_low:
        r.score -= 18
        r.sig(f"30일 신저가 이탈 — ${cur:.4f} ≤ ${lo30:.4f} (-18)", "bear")
    elif broke_7d_low:
        r.score -= 10
        r.sig(f"7일 신저가 이탈 — ${cur:.4f} ≤ ${lo7:.4f} (-10)", "bear")

    # ── Range position bonus ──────────────────────────────────────────────
    if not (broke_30d_high or broke_30d_low):
        if pos_pct >= 80:
            r.score += 5
            r.sig(f"레인지 상단 {pos_pct:.0f}% (+5)", "bull")
        elif pos_pct <= 20:
            r.score -= 3
            r.sig(f"레인지 하단 {pos_pct:.0f}% (-3)", "bear")
        else:
            r.sig(f"레인지 중간 {pos_pct:.0f}%", "neut")

    r.meta.update({
        "hi7": hi7, "lo7": lo7,
        "hi30": hi30, "lo30": lo30,
        "pos_pct": round(pos_pct, 1),
        "broke_30d_high": broke_30d_high,
        "broke_30d_low":  broke_30d_low,
        "broke_7d_high":  broke_7d_high,
        "broke_7d_low":   broke_7d_low,
    })
    r.score = max(-20, min(20, round(r.score)))
    return r
