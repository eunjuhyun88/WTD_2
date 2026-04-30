"""S19 / S20 — Open Interest Squeeze + Futures Basis.

References:
    [1] Alexander, C. & Imeraj, A. (2023). Crypto quanto, inverse, and
        perpetual futures pricing.  Journal of Futures Markets 43(4).
    [2] Liu, Y. & Tsyvinski, A. (2021). Risks and returns of cryptocurrency.
        Review of Financial Studies 34(6), 2689–2727.
    [3] Brunetti, C. & Buyukşahin, B. (2009). Is speculation destabilizing?
        SSRN Working Paper 1393524.  (OI / volume ratio interpretation)

S19 s19_oi_squeeze : OI/Volume ratio + FR sign → structural positioning signal
S20 s20_basis      : Perpetual basis = (mark − index) / index → sentiment

Critical fixes:
──────────────
S19: OI/volume threshold raised from 1.0× to 2.0×.
    Binance BTC typically shows OI ≈ 1–3× daily volume; threshold of 1.0
    fired almost continuously.  2.0× represents genuine excess positioning.

S20: Backwardation logic was INVERTED — scored bearish (basis < 0) as +12 bullish.
    Correct interpretation for perpetual futures:
      Contango   (basis > 0, mark > index):
        Buyers willing to pay premium → bullish demand → positive score.
      Backwardation (basis < 0, mark < index):
        Futures at discount vs spot → sellers dominant / short pressure
        → negative score (bearish).

    NOTE: In classical commodity futures, backwardation implies supply
    tightness and can be bullish.  For perpetuals this mechanism does not
    apply — the funding rate arbitrage resets the basis continuously.
    Backwardation in perpetuals means short sellers are dominant.
"""
from __future__ import annotations

from market_engine.types import LayerResult


def s19_oi_squeeze(
    oi_notional: float | None,
    vol_24h:     float | None,
    avg_fr:      float | None = None,
) -> LayerResult:
    """OI / 24h-volume ratio — structural positioning analysis.

    Args:
        oi_notional : OI in USD (openInterest × markPrice)
        vol_24h     : 24-hour volume in USD
        avg_fr      : funding rate (raw decimal, e.g. -0.001 = -0.1%)
    """
    r = LayerResult()
    if oi_notional is None or vol_24h is None or vol_24h == 0:
        r.sig("OI 데이터 없음", "neut")
        return r

    oi_ratio = oi_notional / vol_24h

    # Threshold raised to 2.0× (prior: 1.0×) to avoid constant firing on BTC
    if oi_ratio >= 4.0:
        base_pts = 12
        label    = "OI 극단 과적재"
    elif oi_ratio >= 2.0:
        base_pts = 8
        label    = "OI 과열 수준"
    elif oi_ratio >= 1.0:
        base_pts = 3
        label    = "OI 관심도 높음"
    else:
        r.sig(f"OI/Vol {oi_ratio:.2f}× — 정상 수준", "neut")
        r.meta["oi_ratio"] = round(oi_ratio, 3)
        return r

    # FR sign determines squeeze direction
    fr_bonus = 0
    fr_note  = ""
    if avg_fr is not None:
        if avg_fr < -0.001:   # negative → shorts paying → short-squeeze risk
            fr_bonus = 8
            fr_note  = " + 숏스퀴즈 위험"
        elif avg_fr > 0.001:  # positive → longs paying → long-liquidation risk
            fr_bonus = -5
            fr_note  = " + 롱청산 위험"

    score = base_pts + fr_bonus
    tone  = "bull" if score > 0 else "warn"
    r.sig(
        f"{label} OI/Vol {oi_ratio:.2f}×{fr_note} ({score:+d})",
        tone,
    )

    r.meta["oi_ratio"] = round(oi_ratio, 3)
    r.score = max(-15, min(20, round(score)))
    return r


def s20_basis(
    mark_price:  float | None,
    index_price: float | None,
    is_real_basis: bool = False,
) -> LayerResult:
    """Perpetual futures basis analysis.

    Basis = (mark_price − index_price) / index_price × 100 %

    Contango   (basis > 0): futures premium → bullish demand signal.
    Backwardation (basis < 0): futures discount → bearish / short pressure.
    """
    r = LayerResult()
    if mark_price is None or index_price is None or index_price == 0:
        r.sig("현/선물 가격 데이터 없음", "neut")
        return r

    basis = (mark_price - index_price) / index_price * 100

    # Threshold calibration: 0.1% is typical noise; 0.3%+ is meaningful
    if basis >= 0.50:
        r.score += 10
        r.sig(f"선물 프리미엄 {basis:.3f}% (Contango 강함) — 강한 롱 수요 (+10)", "bull")
    elif basis >= 0.20:
        r.score += 5
        r.sig(f"선물 프리미엄 {basis:.3f}% (Contango) — 롱 수요 (+5)", "bull")
    elif basis <= -0.50:
        r.score -= 10
        r.sig(f"선물 디스카운트 {basis:.3f}% (Backwardation 강함) — 숏 압박 (-10)", "bear")
    elif basis <= -0.20:
        r.score -= 5
        r.sig(f"선물 디스카운트 {basis:.3f}% (Backwardation) — 숏 우세 (-5)", "bear")
    else:
        r.sig(f"베이시스 {basis:.3f}% — 중립 (< ±0.20%)", "neut")

    r.meta["basis"]       = round(basis, 4)
    r.meta["mark_price"]  = mark_price
    r.meta["index_price"] = index_price
    r.meta["basis_type"]  = "spot_futures" if is_real_basis else "mark_index"
    r.score = max(-12, min(12, round(r.score)))
    return r
