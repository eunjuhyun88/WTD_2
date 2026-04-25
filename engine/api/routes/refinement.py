"""Refinement endpoints — pattern performance stats and threshold suggestions.

Routes:
    GET /refinement/stats               — all pattern stats (success rate, EV, decay)
    GET /refinement/stats/{slug}        — single pattern stats
    GET /refinement/suggestions         — threshold improvement suggestions
    GET /refinement/leaderboard         — patterns ranked by expected value
"""
from __future__ import annotations

from dataclasses import asdict
import threading
import time
from typing import Any

from fastapi import APIRouter, HTTPException

import logging

from ledger.store import get_ledger_store, _compute_stats_from_outcomes
from ledger.types import PatternStats
from patterns.registry import PATTERN_REGISTRY_STORE

log = logging.getLogger("engine.refinement")

router = APIRouter()
_ledger = get_ledger_store()
_REFINEMENT_CACHE_TTL = 300.0  # 5 min — matches stats/engine.py TTL (10× fewer Supabase queries)
_REFINEMENT_CACHE_LOCK = threading.Lock()
_refinement_cache_ts = 0.0
_refinement_cache_rows: list[dict[str, Any]] | None = None
_refinement_cache_by_slug: dict[str, dict[str, Any]] | None = None


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


def _build_refinement_snapshot() -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    t0 = time.perf_counter()
    rows: list[dict[str, Any]] = []
    by_slug: dict[str, dict[str, Any]] = {}

    # Batch-prefetch all outcomes in 1 roundtrip when SupabaseLedgerStore is active.
    # Falls back to per-slug compute_stats() in local dev (FileLedgerStore).
    prefetched: dict[str, list] | None = None
    if hasattr(_ledger, "batch_list_all"):
        try:
            prefetched = _ledger.batch_list_all()
        except Exception:
            prefetched = None

    for pattern in PATTERN_REGISTRY_STORE.list_all():
        slug = pattern.slug
        if prefetched is not None:
            outcomes = prefetched.get(slug, [])
            stats = _compute_stats_from_outcomes(slug, outcomes)
        else:
            stats = _ledger.compute_stats(slug)
        row = _stats_to_dict(stats)
        row["suggestion"] = _suggestion(stats)
        rows.append(row)
        by_slug[slug] = row

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    log.info(
        "refinement snapshot: %d patterns in %dms (batch=%s)",
        len(rows), elapsed_ms, prefetched is not None,
    )
    return rows, by_slug


def _get_refinement_snapshot() -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    global _refinement_cache_ts, _refinement_cache_rows, _refinement_cache_by_slug

    now = time.monotonic()
    with _REFINEMENT_CACHE_LOCK:
        cached = (
            _refinement_cache_rows is not None
            and _refinement_cache_by_slug is not None
            and (now - _refinement_cache_ts) < _REFINEMENT_CACHE_TTL
        )
        if cached:
            return _refinement_cache_rows, _refinement_cache_by_slug

        rows, by_slug = _build_refinement_snapshot()
        _refinement_cache_rows = rows
        _refinement_cache_by_slug = by_slug
        _refinement_cache_ts = now
        return rows, by_slug


@router.get("/stats")
async def get_all_stats() -> dict:
    """Return performance stats for all registered patterns."""
    rows, _ = _get_refinement_snapshot()
    results = sorted(
        rows,
        key=lambda r: (
            r["expected_value"] is not None,
            r["expected_value"] or 0,
        ),
        reverse=True,
    )

    return {
        "ok": True,
        "count": len(results),
        "patterns": results,
    }


@router.get("/stats/{slug}")
async def get_pattern_stats(slug: str) -> dict:
    """Return detailed stats for a single pattern slug."""
    _, by_slug = _get_refinement_snapshot()
    if slug not in by_slug:
        raise HTTPException(status_code=404, detail=f"Unknown pattern slug: {slug}")

    return {"ok": True, "stats": by_slug[slug]}


@router.get("/suggestions")
async def get_suggestions() -> dict:
    """Return actionable threshold suggestions for all patterns with data."""
    rows, _ = _get_refinement_snapshot()
    out = []
    for row in rows:
        if int(row["total_instances"]) < 5:
            continue
        suggestion = row.get("suggestion")
        if suggestion:
            out.append({
                "pattern_slug": row["pattern_slug"],
                "suggestion": suggestion,
                "success_rate": row["success_rate"],
                "expected_value": row["expected_value"],
                "total_instances": row["total_instances"],
                "decay_direction": row["decay_direction"],
            })

    return {"ok": True, "count": len(out), "suggestions": out}


@router.get("/leaderboard")
async def get_leaderboard() -> dict:
    """Rank patterns by expected value (EV = win_rate * avg_gain + loss_rate * avg_loss)."""
    stats_rows, _ = _get_refinement_snapshot()
    rows = sorted(
        [
            {
                "slug": row["pattern_slug"],
                "total": row["total_instances"],
                "win_rate": round(float(row["success_rate"]), 3),
                "ev": row["expected_value"],
                "avg_gain": row["avg_gain_pct"],
                "avg_loss": row["avg_loss_pct"],
                "decay": row["decay_direction"],
                "recent_30d_rate": row["recent_30d_success_rate"],
            }
            for row in stats_rows
        ],
        key=lambda r: (r["ev"] is not None, r["ev"] or 0),
        reverse=True,
    )
    return {"ok": True, "count": len(rows), "leaderboard": rows}
