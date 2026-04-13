"""L2 — Funding Rate / OI / Long-Short Ratio / Taker Flow.

References:
    [1] Cong, L.W., He, Z. & Tang, K. (2021). Staking, token pricing, and
        crypto carry trade. NBER Working Paper 28204.
    [2] Alexander, C. & Imeraj, A. (2023). Crypto quanto, inverse, and
        perpetual futures. Journal of Futures Markets.
    [3] Ether Futures Basis and Funding Rates — BitMEX Research (2019).
        (practical calibration of perpetual funding signals)

Critical bug in prior implementation:
    Funding rate thresholds were scaled as PERCENTAGES (fr <= -0.07 = -7%)
    while Binance actually reports FR in raw decimal form where
      0.0001 = 0.01% per 8h  (standard neutral default)
      0.0075 = 0.75% per 8h  (Binance maximum cap)

    The old extreme threshold (fr <= -0.07) required -7% per 8h —
    PHYSICALLY IMPOSSIBLE on Binance. No signal ever fired.

Corrected thresholds (raw decimal, Binance perpetual scale):
    Extreme:    |fr| ≥ 0.003  (0.3% / 8h → annualised ≈ 328%)
    Strong:     |fr| ≥ 0.001  (0.1% / 8h → annualised ≈ 109%)
    Moderate:   |fr| ≥ 0.0003 (0.03% / 8h → annualised ≈ 33%)
    Neutral:    |fr| < 0.0001

Score range: [-30, +30]

Inputs (all optional — missing keys score 0):
    fr           : float  current 8h funding rate (e.g. 0.0001 = 0.01%)
    oi_pct       : float  OI % change (e.g. +5.0 = +5%)
    ls_ratio     : float  long/short ratio (e.g. 1.8)
    taker_ratio  : float  taker buy vol / sell vol (≥1 = buy-side dominant)
    price_pct    : float  price % change last period
"""
from __future__ import annotations

from market_engine.types import LayerResult

# ── Funding-rate thresholds (raw Binance decimal, NOT percentage) ──────────
_FR_EXTREME  = 0.003    # 0.3% / 8h
_FR_STRONG   = 0.001    # 0.1% / 8h
_FR_MODERATE = 0.0003   # 0.03% / 8h


def l2_flow(
    fr:          float | None = None,
    oi_pct:      float | None = None,
    ls_ratio:    float | None = None,
    taker_ratio: float | None = None,
    price_pct:   float | None = None,
) -> LayerResult:
    r = LayerResult()

    # ── 1. Funding Rate ────────────────────────────────────────────────
    # Negative FR → shorts paying longs → short-squeeze pressure → bullish
    # Positive FR → longs paying shorts → overleveraged longs → bearish
    if fr is not None:
        if fr <= -_FR_EXTREME:
            pts = 24
            r.sig(f"FR {fr:.4%} — 극단 음수 FR, 숏스퀴즈 임박 (+{pts})", "bull")
            r.score += pts
        elif fr <= -_FR_STRONG:
            pts = 15
            r.sig(f"FR {fr:.4%} — 강한 음수 FR (+{pts})", "bull")
            r.score += pts
        elif fr <= -_FR_MODERATE:
            pts = 8
            r.sig(f"FR {fr:.4%} — 음수 FR (+{pts})", "bull")
            r.score += pts
        elif fr >= _FR_EXTREME:
            pts = -24
            r.sig(f"FR {fr:.4%} — 극단 양수 FR, 롱청산 위험 ({pts})", "bear")
            r.score += pts
        elif fr >= _FR_STRONG:
            pts = -15
            r.sig(f"FR {fr:.4%} — 과열 양수 FR ({pts})", "bear")
            r.score += pts
        elif fr >= _FR_MODERATE:
            pts = -8
            r.sig(f"FR {fr:.4%} — 양수 FR ({pts})", "bear")
            r.score += pts
        else:
            r.sig(f"FR {fr:.4%} — 중립", "neut")

        r.meta["fr"] = fr
        r.meta["fr_pct"] = round(fr * 100, 5)  # display in %

    # ── 2. OI + Price Direction ───────────────────────────────────────
    # Classic 4-quadrant OI interpretation (Cong et al. 2021)
    if oi_pct is not None and price_pct is not None:
        if oi_pct > 3 and price_pct > 0:
            # OI↑ + price↑ → new money entering long → trend continuation
            r.score += 15
            r.sig(f"OI↑{oi_pct:+.1f}% + 가격↑ — 신규 롱 진입 (+15)", "bull")
        elif oi_pct > 3 and price_pct < 0:
            # OI↑ + price↓ → new shorts accumulating → bearish
            r.score -= 10
            r.sig(f"OI↑{oi_pct:+.1f}% + 가격↓ — 숏 누적 (-10)", "bear")
        elif oi_pct < -3 and price_pct > 0:
            # OI↓ + price↑ → shorts closing (squeeze) → bullish
            r.score += 12
            r.sig(f"OI↓{oi_pct:+.1f}% + 가격↑ — 숏청산 스퀴즈 (+12)", "bull")
        elif oi_pct < -3 and price_pct < 0:
            # OI↓ + price↓ → longs getting stopped out → bearish
            r.score -= 12
            r.sig(f"OI↓{oi_pct:+.1f}% + 가격↓ — 롱청산 패닉 (-12)", "bear")

        r.meta["oi_pct"]    = oi_pct
        r.meta["price_pct"] = price_pct

    # ── 3. Long / Short Ratio (contrarian) ────────────────────────────
    # Extreme long bias → crowded trade → fade → bearish
    # Extreme short bias → fuel for squeeze → bullish
    if ls_ratio is not None:
        if ls_ratio >= 2.2:
            r.score -= 14
            r.sig(f"L/S {ls_ratio:.2f} — 극단 롱 편향 (역배팅 신호 -14)", "bear")
        elif ls_ratio >= 1.8:
            r.score -= 8
            r.sig(f"L/S {ls_ratio:.2f} — 롱 과열 (-8)", "bear")
        elif ls_ratio <= 0.6:
            r.score += 12
            r.sig(f"L/S {ls_ratio:.2f} — 극단 숏 편향 (스퀴즈 연료 +12)", "bull")
        elif ls_ratio <= 0.8:
            r.score += 6
            r.sig(f"L/S {ls_ratio:.2f} — 숏 과열 (+6)", "bull")
        else:
            r.sig(f"L/S {ls_ratio:.2f} — 중립 (0.8–1.8 범위)", "neut")

        r.meta["ls_ratio"] = ls_ratio

    # ── 4. Taker Buy/Sell Ratio ───────────────────────────────────────
    # Reflects who is aggressively hitting the book (takers = price-takers)
    if taker_ratio is not None:
        if taker_ratio >= 1.25:
            r.score += 10
            r.sig(f"Taker Buy {taker_ratio:.2f}× — 공격 매수 (+10)", "bull")
        elif taker_ratio >= 1.10:
            r.score += 5
            r.sig(f"Taker Buy {taker_ratio:.2f}× — 매수 우세 (+5)", "bull")
        elif taker_ratio <= 0.75:
            r.score -= 10
            r.sig(f"Taker Buy {taker_ratio:.2f}× — 공격 매도 (-10)", "bear")
        elif taker_ratio <= 0.90:
            r.score -= 5
            r.sig(f"Taker Buy {taker_ratio:.2f}× — 매도 우세 (-5)", "bear")

        r.meta["taker_ratio"] = taker_ratio

    r.score = max(-30, min(30, round(r.score)))
    return r
