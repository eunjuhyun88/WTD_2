"""L5 / L9 — Liquidation Analysis.

L5  : FR + OI based liquidation zone estimation
L9  : Real forceOrders liquidation data (1H aggregation)

Sources: Alpha Terminal L5_liq(), L9_realLiq()
"""
from __future__ import annotations

from market_engine.types import LayerResult


def l5_liq_estimate(
    fr: float | None,
    current_price: float,
    oi_pct: float | None = None,
) -> LayerResult:
    """Estimate liquidation zone from funding rate + OI direction."""
    r = LayerResult()
    if fr is None:
        r.sig("청산존 추정 불가 (FR 없음)", "neut")
        return r

    # Extreme negative FR + OI increase → many shorts, long squeeze risk low,
    # but short squeeze risk HIGH → bullish
    if fr < -0.05 and (oi_pct or 0) > 2:
        r.score += 12
        r.sig(f"숏 과적재 감지 — FR {fr:.3%} + OI↑ → 숏스퀴즈 위험 (+12)", "bull")
    elif fr > 0.05 and (oi_pct or 0) > 2:
        r.score -= 12
        r.sig(f"롱 과적재 감지 — FR {fr:.3%} + OI↑ → 롱청산 위험 (-12)", "bear")
    elif fr < -0.02:
        r.score += 5
        r.sig(f"음수 FR {fr:.3%} — 숏 부담 (+5)", "bull")
    elif fr > 0.02:
        r.score -= 5
        r.sig(f"양수 FR {fr:.3%} — 롱 부담 (-5)", "bear")

    r.meta["fr"] = fr
    r.score = max(-15, min(15, round(r.score)))
    return r


def l9_real_liq(
    short_liq_usd: float = 0.0,   # forceOrders BUY side (closing shorts)
    long_liq_usd:  float = 0.0,   # forceOrders SELL side (closing longs)
    window_hours:  int   = 1,
) -> LayerResult:
    """
    forceOrders BUY  = short positions being force-closed → upward pressure
    forceOrders SELL = long positions being force-closed  → downward pressure

    Thresholds (from HTML): $500K → moderate, $1M → strong
    """
    r = LayerResult()
    net = short_liq_usd - long_liq_usd

    if short_liq_usd >= 1_000_000:
        r.score += 15
        r.sig(f"${short_liq_usd/1e6:.1f}M 숏청산 — 상방 스퀴즈 강도 HIGH (+15)", "bull")
    elif short_liq_usd >= 500_000:
        r.score += 10
        r.sig(f"${short_liq_usd/1e6:.2f}M 숏청산 감지 (+10)", "bull")

    if long_liq_usd >= 1_000_000:
        r.score -= 15
        r.sig(f"${long_liq_usd/1e6:.1f}M 롱청산 — 하방 가속 HIGH (-15)", "bear")
    elif long_liq_usd >= 500_000:
        r.score -= 10
        r.sig(f"${long_liq_usd/1e6:.2f}M 롱청산 감지 (-10)", "bear")

    if short_liq_usd < 100_000 and long_liq_usd < 100_000:
        r.sig("강제청산 미미 — 정상 시장", "neut")

    r.meta.update({
        "short_liq": short_liq_usd,
        "long_liq":  long_liq_usd,
        "net_liq":   net,
        "window_h":  window_hours,
    })
    r.score = max(-15, min(15, round(r.score)))
    return r
