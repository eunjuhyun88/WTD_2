"""L5 / L9 — Liquidation Analysis.

References:
    [1] Wen, F. et al. (2022). Cryptocurrency liquidation cascades and
        market instability. Finance Research Letters.
    [2] Binance FAPI docs — GET /fapi/v1/forceOrders (forced liquidation
        orders, 1-hour rolling window).

L5  l5_liq_estimate : Heuristic estimate from FR + OI direction.
L9  l9_real_liq     : Real forceOrders data (1H aggregation).

Critical fix in l9_real_liq:
    Old: absolute $500K / $1M thresholds.
    Problem: for BTC (~$15B OI), $1M is 0.007% of OI — trivial noise.
             For a $100M OI alt, $1M = 1% of OI — highly significant.
    Fix: OI-relative thresholds.
         liq_pct = liq_usd / oi_notional × 100
         ≥ 0.1% of OI = moderate   (same as old $500K on $500M OI asset)
         ≥ 0.3% of OI = strong
         ≥ 0.7% of OI = extreme
    Fallback: absolute thresholds if oi_notional is unavailable.
"""
from __future__ import annotations

from market_engine.types import LayerResult


def l5_liq_estimate(
    fr:           float | None,
    current_price: float,
    oi_pct:       float | None = None,
) -> LayerResult:
    """Heuristic liquidation zone estimate from funding rate + OI direction.

    Note: FR thresholds use corrected Binance raw decimal scale
    (same calibration as l2_flow.py).
    """
    r = LayerResult()
    if fr is None:
        r.sig("청산존 추정 불가 (FR 없음)", "neut")
        return r

    _FR_EXTREME = 0.003     # 0.3% / 8h
    _FR_MODERATE = 0.001    # 0.1% / 8h
    _FR_MILD = 0.0003       # 0.03% / 8h

    if fr < -_FR_EXTREME and (oi_pct or 0) > 2:
        r.score += 12
        r.sig(
            f"숏 과적재 — FR {fr:.4%} + OI↑{(oi_pct or 0):.1f}% → 숏스퀴즈 위험 (+12)",
            "bull",
        )
    elif fr > _FR_EXTREME and (oi_pct or 0) > 2:
        r.score -= 12
        r.sig(
            f"롱 과적재 — FR {fr:.4%} + OI↑{(oi_pct or 0):.1f}% → 롱청산 위험 (-12)",
            "bear",
        )
    elif fr < -_FR_MODERATE:
        r.score += 5
        r.sig(f"음수 FR {fr:.4%} — 숏 부담 증가 (+5)", "bull")
    elif fr > _FR_MODERATE:
        r.score -= 5
        r.sig(f"양수 FR {fr:.4%} — 롱 부담 증가 (-5)", "bear")
    elif abs(fr) >= _FR_MILD:
        r.sig(f"FR {fr:.4%} — 미미한 편향", "neut")

    r.meta["fr"] = fr
    r.score = max(-15, min(15, round(r.score)))
    return r


def l9_real_liq(
    short_liq_usd: float = 0.0,    # forceOrders BUY side (shorts force-closed)
    long_liq_usd:  float = 0.0,    # forceOrders SELL side (longs force-closed)
    window_hours:  int   = 1,
    oi_notional:   float | None = None,  # OI in USD for normalization
) -> LayerResult:
    """Real forceOrders liquidation analysis.

    forceOrders BUY  = short positions being force-closed → upward pressure
    forceOrders SELL = long positions being force-closed  → downward pressure

    OI-relative scoring (preferred):
        ≥ 0.07% of OI → moderate
        ≥ 0.3%  of OI → strong
        ≥ 0.7%  of OI → extreme

    Absolute fallback (when oi_notional unavailable):
        ≥ $500K   → moderate
        ≥ $2M     → strong
        ≥ $10M    → extreme
    """
    r = LayerResult()

    def _classify(liq_usd: float) -> tuple[str, int]:
        """Returns (label, abs_pts)."""
        if oi_notional and oi_notional > 0:
            pct = liq_usd / oi_notional * 100
            if pct >= 0.70:
                return "EXTREME", 15
            elif pct >= 0.30:
                return "STRONG", 12
            elif pct >= 0.07:
                return "MODERATE", 7
            else:
                return "NORMAL", 0
        else:
            # Absolute fallback
            if liq_usd >= 10_000_000:
                return "EXTREME", 15
            elif liq_usd >= 2_000_000:
                return "STRONG", 12
            elif liq_usd >= 500_000:
                return "MODERATE", 7
            else:
                return "NORMAL", 0

    short_label, short_pts = _classify(short_liq_usd)
    long_label,  long_pts  = _classify(long_liq_usd)

    if short_pts > 0:
        pct_str = ""
        if oi_notional and oi_notional > 0:
            pct_str = f" ({short_liq_usd / oi_notional:.3%} of OI)"
        r.score += short_pts
        r.sig(
            f"숏청산 {short_label} ${short_liq_usd/1e6:.2f}M{pct_str} (+{short_pts})",
            "bull",
        )

    if long_pts > 0:
        pct_str = ""
        if oi_notional and oi_notional > 0:
            pct_str = f" ({long_liq_usd / oi_notional:.3%} of OI)"
        r.score -= long_pts
        r.sig(
            f"롱청산 {long_label} ${long_liq_usd/1e6:.2f}M{pct_str} (-{long_pts})",
            "bear",
        )

    if short_pts == 0 and long_pts == 0:
        r.sig("강제청산 미미 — 정상 시장", "neut")

    net = short_liq_usd - long_liq_usd
    r.meta.update({
        "short_liq":    short_liq_usd,
        "long_liq":     long_liq_usd,
        "net_liq":      net,
        "window_h":     window_hours,
        "oi_notional":  oi_notional,
        "normalized":   oi_notional is not None and oi_notional > 0,
    })
    r.score = max(-15, min(15, round(r.score)))
    return r
