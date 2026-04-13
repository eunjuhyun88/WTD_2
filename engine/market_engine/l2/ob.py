"""L4 / S17 — Order Book Snapshot Analysis.

L4  : Alpha Terminal — bid_total / ask_total across all visible levels.
      8-tier scoring table.

S17 : Alpha Hunter — same ratio from depth20 snapshot.

Both accept pre-computed bid/ask totals in quote currency.
"""
from __future__ import annotations

from market_engine.types import LayerResult


def _score_ob_ratio(bid_total: float, ask_total: float) -> LayerResult:
    r = LayerResult()
    if ask_total == 0:
        r.sig("호가 데이터 없음", "neut")
        return r

    ratio = bid_total / ask_total

    # 8-tier table from Alpha Terminal L4_ob()
    if ratio >= 3.5:
        r.score = 20; r.sig(f"호가 불균형 {ratio:.2f}× — 극단 매수벽 (+20)", "bull")
    elif ratio >= 2.5:
        r.score = 15; r.sig(f"호가 불균형 {ratio:.2f}× — 강한 매수벽 (+15)", "bull")
    elif ratio >= 1.8:
        r.score = 10; r.sig(f"호가 불균형 {ratio:.2f}× — 매수 우세 (+10)", "bull")
    elif ratio >= 1.3:
        r.score = 5;  r.sig(f"호가 비율 {ratio:.2f}× (+5)", "bull")
    elif ratio >= 0.8:
        r.score = 0;  r.sig(f"호가 균형 {ratio:.2f}×", "neut")
    elif ratio >= 0.5:
        r.score = -5; r.sig(f"호가 비율 {ratio:.2f}× (-5)", "bear")
    elif ratio >= 0.3:
        r.score = -12; r.sig(f"호가 불균형 {ratio:.2f}× — 매도벽 우세 (-12)", "bear")
    else:
        r.score = -20; r.sig(f"호가 불균형 {ratio:.2f}× — 극단 매도벽 (-20)", "bear")

    r.meta["bid_total"] = round(bid_total, 0)
    r.meta["ask_total"] = round(ask_total, 0)
    r.meta["ratio"]     = round(ratio, 3)
    r.score = max(-20, min(20, r.score))
    return r


def l4_ob(bid_total: float, ask_total: float) -> LayerResult:
    """Alpha Terminal: full depth bid/ask totals."""
    return _score_ob_ratio(bid_total, ask_total)


def s17_ob(bid_total: float, ask_total: float) -> LayerResult:
    """Alpha Hunter: depth-20 snapshot bid/ask totals."""
    return _score_ob_ratio(bid_total, ask_total)
