"""Refinement endpoints — pattern performance stats and threshold suggestions.

Routes:
    GET /refinement/stats               — all pattern stats (success rate, EV, decay)
    GET /refinement/stats/{slug}        — single pattern stats
    GET /refinement/suggestions         — threshold improvement suggestions
    GET /refinement/leaderboard         — patterns ranked by expected value
"""
from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, HTTPException

from ledger.store import LedgerStore
from ledger.types import PatternStats
from patterns.registry import PATTERN_REGISTRY_STORE

router = APIRouter()
_ledger = LedgerStore()


def _stats_to_dict(s: PatternStats) -> dict[str, Any]:
    d = asdict(s)
    # round floats for readability
    for k in ("success_rate", "avg_gain_pct", "avg_loss_pct", "expected_value",
              "avg_duration_hours", "recent_30d_success_rate",
              "btc_bullish_rate", "btc_bearish_rate", "btc_sideways_rate"):
        if d.get(k) is not None:
            d[k] = round(d[k], 4)
    return d


def _suggestion(stats: PatternStats) -> str | None:
    """Return a plain-English threshold suggestion based on stats, or None."""
    if stats.total_instances < 5:
        return None
    if stats.decay_direction == "decaying" and stats.success_rate < 0.45:
        return f"Pattern is decaying ({stats.success_rate:.0%} win rate, declining). Consider tightening entry conditions or increasing block score threshold."
    if stats.expected_value is not None and stats.expected_value < 0:
        return f"Negative EV ({stats.expected_value:.2%}). Stop using this pattern in live trading until backtest conditions improve."
    if stats.btc_bearish_rate is not None and stats.btc_bearish_rate < 0.30:
        return "Win rate drops below 30% in BTC bearish regime. Add BTC-bias gate to block entries during downtrend."
    if stats.success_rate >= 0.70 and stats.avg_gain_pct and stats.avg_gain_pct < 0.03:
        return "High win rate but small avg gain. Consider extending TP target to capture larger moves."
    if stats.recent_30d_success_rate is not None and stats.recent_30d_success_rate < 0.40:
        return f"30d recent win rate is {stats.recent_30d_success_rate:.0%}, below all-time {stats.success_rate:.0%}. Pattern may be losing edge."
    return None


@router.get("/stats")
async def get_all_stats() -> dict:
    """Return performance stats for all registered patterns."""
    patterns = PATTERN_REGISTRY_STORE.list_all()
    slugs = [p.slug for p in patterns]

    results = []
    for slug in slugs:
        stats = _ledger.compute_stats(slug)
        d = _stats_to_dict(stats)
        d["suggestion"] = _suggestion(stats)
        results.append(d)

    # Sort by expected_value desc (patterns with data first)
    results.sort(key=lambda r: (
        r["expected_value"] is not None,
        r["expected_value"] or 0,
    ), reverse=True)

    return {
        "ok": True,
        "count": len(results),
        "patterns": results,
    }


@router.get("/stats/{slug}")
async def get_pattern_stats(slug: str) -> dict:
    """Return detailed stats for a single pattern slug."""
    patterns = PATTERN_REGISTRY_STORE.list_all()
    known = {p.slug for p in patterns}
    if slug not in known:
        raise HTTPException(status_code=404, detail=f"Unknown pattern slug: {slug}")

    stats = _ledger.compute_stats(slug)
    d = _stats_to_dict(stats)
    d["suggestion"] = _suggestion(stats)
    return {"ok": True, "stats": d}


@router.get("/suggestions")
async def get_suggestions() -> dict:
    """Return actionable threshold suggestions for all patterns with data."""
    patterns = PATTERN_REGISTRY_STORE.list_all()
    out = []
    for p in patterns:
        stats = _ledger.compute_stats(p.slug)
        if stats.total_instances < 5:
            continue
        suggestion = _suggestion(stats)
        if suggestion:
            out.append({
                "pattern_slug": p.slug,
                "suggestion": suggestion,
                "success_rate": round(stats.success_rate, 4),
                "expected_value": round(stats.expected_value, 4) if stats.expected_value is not None else None,
                "total_instances": stats.total_instances,
                "decay_direction": stats.decay_direction,
            })

    return {"ok": True, "count": len(out), "suggestions": out}


@router.get("/leaderboard")
async def get_leaderboard() -> dict:
    """Rank patterns by expected value (EV = win_rate * avg_gain + loss_rate * avg_loss)."""
    patterns = PATTERN_REGISTRY_STORE.list_all()
    rows = []
    for p in patterns:
        stats = _ledger.compute_stats(p.slug)
        rows.append({
            "slug": p.slug,
            "total": stats.total_instances,
            "win_rate": round(stats.success_rate, 3),
            "ev": round(stats.expected_value, 4) if stats.expected_value is not None else None,
            "avg_gain": round(stats.avg_gain_pct, 4) if stats.avg_gain_pct is not None else None,
            "avg_loss": round(stats.avg_loss_pct, 4) if stats.avg_loss_pct is not None else None,
            "decay": stats.decay_direction,
            "recent_30d_rate": round(stats.recent_30d_success_rate, 3) if stats.recent_30d_success_rate is not None else None,
        })

    # Sort: patterns with EV data first, then by EV desc
    rows.sort(key=lambda r: (r["ev"] is not None, r["ev"] or 0), reverse=True)
    return {"ok": True, "count": len(rows), "leaderboard": rows}
