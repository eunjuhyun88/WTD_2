"""L2 — Funding Rate / OI / L-S Ratio / Taker Flow.

Ported from Alpha Terminal L2_flow().

score range: roughly [-30, +30]

Inputs (all optional — missing keys score 0):
    fr           : float  current funding rate  e.g. -0.03 = -3%
    oi_pct       : float  OI % change           e.g. +5.0 = +5%
    ls_ratio     : float  long/short ratio      e.g. 1.8
    taker_ratio  : float  taker buy vol / sell vol
    price_pct    : float  price % change last period
"""
from __future__ import annotations

from market_engine.types import LayerResult


def l2_flow(
    fr: float | None = None,
    oi_pct: float | None = None,
    ls_ratio: float | None = None,
    taker_ratio: float | None = None,
    price_pct: float | None = None,
) -> LayerResult:
    r = LayerResult()

    # ── Funding Rate ──────────────────────────────────────────────────────
    # Extreme negative FR → shorts will be squeezed → bullish
    # Extreme positive FR → longs paying heavily → bearish
    if fr is not None:
        if fr <= -0.07:
            pts = 24
            r.score += pts
            r.sig(f"FR {fr:.3%} — 극단 음수, 숏스퀴즈 임박 (+{pts})", "bull")
        elif fr <= -0.03:
            pts = 15
            r.score += pts
            r.sig(f"FR {fr:.3%} — 강한 음수 FR (+{pts})", "bull")
        elif fr <= -0.01:
            pts = 8
            r.score += pts
            r.sig(f"FR {fr:.3%} — 음수 FR (+{pts})", "bull")
        elif fr >= 0.08:
            pts = -24
            r.score += pts
            r.sig(f"FR {fr:.3%} — 극단 양수, 롱청산 위험 ({pts})", "bear")
        elif fr >= 0.05:
            pts = -15
            r.score += pts
            r.sig(f"FR {fr:.3%} — 과열 양수 FR ({pts})", "bear")
        elif fr >= 0.03:
            pts = -8
            r.score += pts
            r.sig(f"FR {fr:.3%} — 양수 FR ({pts})", "bear")
        else:
            r.sig(f"FR {fr:.3%} — 중립", "neut")

    # ── OI + 가격 방향성 ──────────────────────────────────────────────────
    if oi_pct is not None and price_pct is not None:
        if oi_pct > 3 and price_pct > 0:          # OI↑ + 가격↑ → 신규 롱 진입
            r.score += 15; r.sig(f"OI↑{oi_pct:+.1f}% + 가격↑ — 신규 롱 진입 (+15)", "bull")
        elif oi_pct > 3 and price_pct < 0:        # OI↑ + 가격↓ → 숏 누적
            r.score -= 10; r.sig(f"OI↑{oi_pct:+.1f}% + 가격↓ — 숏 누적 (-10)", "bear")
        elif oi_pct < -3 and price_pct > 0:       # OI↓ + 가격↑ → 숏청산 스퀴즈
            r.score += 12; r.sig(f"OI↓{oi_pct:+.1f}% + 가격↑ — 숏청산 스퀴즈 (+12)", "bull")
        elif oi_pct < -3 and price_pct < 0:       # OI↓ + 가격↓ → 롱청산 패닉
            r.score -= 12; r.sig(f"OI↓{oi_pct:+.1f}% + 가격↓ — 롱청산 패닉 (-12)", "bear")
        r.meta["oi_pct"]     = oi_pct
        r.meta["price_pct"]  = price_pct

    # ── L/S Ratio ─────────────────────────────────────────────────────────
    # Extreme long-heavy → contrarian bearish (market too long)
    if ls_ratio is not None:
        if ls_ratio >= 2.2:
            r.score -= 14; r.sig(f"L/S {ls_ratio:.2f} — 극단 롱 편향 (-14)", "bear")
        elif ls_ratio >= 1.8:
            r.score -= 8;  r.sig(f"L/S {ls_ratio:.2f} — 롱 과열 (-8)", "bear")
        elif ls_ratio <= 0.6:
            r.score += 12; r.sig(f"L/S {ls_ratio:.2f} — 극단 숏 편향 (+12)", "bull")
        elif ls_ratio <= 0.8:
            r.score += 6;  r.sig(f"L/S {ls_ratio:.2f} — 숏 과열 (+6)", "bull")
        else:
            r.sig(f"L/S {ls_ratio:.2f} — 중립", "neut")
        r.meta["ls_ratio"] = ls_ratio

    # ── Taker Buy/Sell Ratio ─────────────────────────────────────────────
    if taker_ratio is not None:
        if taker_ratio >= 1.25:
            r.score += 10; r.sig(f"Taker Buy {taker_ratio:.2f}× — 공격 매수 (+10)", "bull")
        elif taker_ratio >= 1.1:
            r.score += 5;  r.sig(f"Taker Buy {taker_ratio:.2f}× — 매수 우세 (+5)", "bull")
        elif taker_ratio <= 0.75:
            r.score -= 10; r.sig(f"Taker Buy {taker_ratio:.2f}× — 공격 매도 (-10)", "bear")
        elif taker_ratio <= 0.9:
            r.score -= 5;  r.sig(f"Taker Buy {taker_ratio:.2f}× — 매도 우세 (-5)", "bear")
        r.meta["taker_ratio"] = taker_ratio

    r.score = max(-30, min(30, round(r.score)))
    return r
