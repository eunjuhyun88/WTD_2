"""S19 / S20 — Open Interest Squeeze + Futures Basis.

S19: OI/Volume ratio + FR sign → short-squeeze probability
S20: (markPrice - indexPrice) / indexPrice → contango vs backwardation

Sources: Alpha Hunter v2.0 S19_openInterest(), S20_basis()
"""
from __future__ import annotations

from market_engine.types import LayerResult


def s19_oi_squeeze(
    oi_notional: float | None,
    vol_24h: float | None,
    avg_fr: float | None = None,
) -> LayerResult:
    """
    oi_notional : OI in USD  (openInterest × markPrice)
    vol_24h     : 24H volume in USD
    avg_fr      : average funding rate (e.g. -0.01 = -1%)
    """
    r = LayerResult()
    if oi_notional is None or vol_24h is None or vol_24h == 0:
        r.sig("OI 데이터 없음", "neut")
        return r

    oi_ratio = oi_notional / vol_24h

    if oi_ratio > 1.0:
        r.score += 10
        extra = ""
        if avg_fr is not None and avg_fr < -0.01:
            r.score += 10
            extra = " + 숏스퀴즈 위험"
        r.sig(f"OI/Vol {oi_ratio:.2f}× — 미결제약정 과열{extra} (+{r.score})", "warn")
    elif oi_ratio > 0.4:
        r.score += 5
        r.sig(f"OI/Vol {oi_ratio:.2f}× — 관심도 높음 (+5)", "bull")
    else:
        r.sig(f"OI/Vol {oi_ratio:.2f}× — 정상 수준", "neut")

    r.meta["oi_ratio"] = round(oi_ratio, 3)
    r.score = max(-10, min(20, round(r.score)))
    return r


def s20_basis(mark_price: float | None, index_price: float | None) -> LayerResult:
    """
    Basis = (mark - index) / index × 100 %
    Contango   (basis > 0) : futures premium → strong long sentiment
    Backwardation (basis < 0) : spot premium → spot-driven rally or short pressure
    """
    r = LayerResult()
    if mark_price is None or index_price is None or index_price == 0:
        r.sig("현/선물 가격 데이터 없음", "neut")
        return r

    basis = (mark_price - index_price) / index_price * 100

    if basis > 0.5:
        r.score += 8
        r.sig(f"선물 프리미엄 {basis:.3f}% (Contango) — 강한 롱 심리 (+8)", "bull")
    elif basis < -0.5:
        r.score += 12
        r.sig(f"현물 프리미엄 {abs(basis):.3f}% (Backwardation) — 현물 주도 / 숏 압박 (+12)", "bull")
    else:
        r.sig(f"베이시스 {basis:.3f}% (정상)", "neut")

    r.meta["basis"] = round(basis, 4)
    r.score = max(-10, min(15, round(r.score)))
    return r
