"""L12 — Sector Flow Analysis.

Scores a symbol relative to its sector's average alpha score.
Requires that other symbols in the same sector have been scored first
(sector_scores dict in GlobalCtx).

Source: Alpha Terminal L12_sector()
"""
from __future__ import annotations

from market_engine.types import GlobalCtx, LayerResult
from sector_map import get_sector, SECTOR_META


def l12_sector(symbol: str, ctx: GlobalCtx) -> LayerResult:
    r = LayerResult()
    sector        = get_sector(symbol)
    sector_label  = SECTOR_META.get(sector, {}).get("label", sector)
    sector_score  = ctx.sector_scores.get(sector, 0.0)
    count         = sum(1 for k in ctx.sector_scores if k == sector)

    r.meta["sector"]       = sector
    r.meta["sector_label"] = sector_label
    r.meta["sector_score"] = round(sector_score, 2)

    if sector_score > 20:
        r.score = 8
        r.sig(f"섹터 [{sector_label}] 강세 흐름 +{sector_score:.0f} (+8)", "bull")
    elif sector_score > 8:
        r.score = 4
        r.sig(f"섹터 [{sector_label}] 상승 모멘텀 (+4)", "bull")
    elif sector_score < -20:
        r.score = -8
        r.sig(f"섹터 [{sector_label}] 약세 흐름 {sector_score:.0f} (-8)", "bear")
    elif sector_score < -8:
        r.score = -4
        r.sig(f"섹터 [{sector_label}] 하락 모멘텀 (-4)", "bear")
    else:
        r.sig(f"섹터 [{sector_label}] 중립", "neut")

    r.score = max(-10, min(10, r.score))
    return r
