"""GET/POST /patterns/* — pattern engine API.

Endpoints:
  GET  /patterns/library              — list all patterns
  GET  /patterns/states               — all pattern states (symbol → phase)
  GET  /patterns/candidates           — entry candidates across all patterns
  GET  /patterns/{slug}/candidates    — entry candidates for one pattern
  GET  /patterns/{slug}/stats         — ledger stats for one pattern
  GET  /patterns/{slug}/library       — return pattern definition
  POST /patterns/scan                 — trigger a scan cycle
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException

from ledger.store import LedgerStore
from patterns.library import PATTERN_LIBRARY, get_pattern
from patterns.scanner import (
    get_entry_candidates_all,
    get_pattern_states,
    run_pattern_scan,
)

router = APIRouter()
_ledger = LedgerStore()


@router.get("/library")
async def list_patterns() -> dict:
    """List all patterns in the library."""
    return {
        "patterns": [
            {
                "slug": p.slug,
                "name": p.name,
                "tags": p.tags,
                "entry_phase": p.entry_phase,
                "phases": [ph.phase_id for ph in p.phases],
            }
            for p in PATTERN_LIBRARY.values()
        ]
    }


@router.get("/states")
async def get_all_states() -> dict:
    """Current phase for all tracked symbols across all patterns."""
    states = get_pattern_states()
    # Filter to non-NONE phases for a cleaner response
    active = {
        slug: {sym: phase for sym, phase in sym_phases.items() if phase != "NONE"}
        for slug, sym_phases in states.items()
    }
    return {"patterns": active}


@router.get("/candidates")
async def get_all_candidates() -> dict:
    """Entry candidates across all patterns."""
    candidates = get_entry_candidates_all()
    return {"entry_candidates": candidates}


@router.post("/scan")
async def trigger_pattern_scan(background_tasks: BackgroundTasks) -> dict:
    """Trigger a pattern scan cycle in background."""
    background_tasks.add_task(run_pattern_scan)
    return {"status": "scan_started", "patterns": list(PATTERN_LIBRARY.keys())}


@router.get("/{slug}/candidates")
async def get_candidates(slug: str) -> dict:
    """Entry candidates for a specific pattern."""
    try:
        pattern = get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}")

    states = get_pattern_states()
    pattern_states = states.get(slug, {})
    candidates = [
        sym for sym, phase in pattern_states.items()
        if phase == pattern.entry_phase
    ]
    return {
        "slug": slug,
        "entry_phase": pattern.entry_phase,
        "candidates": candidates,
        "count": len(candidates),
    }


@router.get("/{slug}/stats")
async def get_stats(slug: str) -> dict:
    """Ledger statistics for a pattern."""
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}")

    stats = _ledger.compute_stats(slug)
    return {
        "pattern_slug": stats.pattern_slug,
        "total": stats.total_instances,
        "pending": stats.pending_count,
        "success": stats.success_count,
        "failure": stats.failure_count,
        "success_rate": round(stats.success_rate, 3),
        "avg_gain_pct": round(stats.avg_gain_pct, 3) if stats.avg_gain_pct is not None else None,
        "avg_duration_hours": round(stats.avg_duration_hours, 1) if stats.avg_duration_hours is not None else None,
        "recent_30d_count": stats.recent_30d_count,
        "recent_30d_success_rate": round(stats.recent_30d_success_rate, 3) if stats.recent_30d_success_rate is not None else None,
    }


@router.get("/{slug}/library")
async def get_pattern_def(slug: str) -> dict:
    """Return the pattern definition."""
    try:
        p = get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}")

    return {
        "slug": p.slug,
        "name": p.name,
        "description": p.description,
        "entry_phase": p.entry_phase,
        "target_phase": p.target_phase,
        "timeframe": p.timeframe,
        "tags": p.tags,
        "phases": [
            {
                "phase_id": ph.phase_id,
                "label": ph.label,
                "required_blocks": ph.required_blocks,
                "optional_blocks": ph.optional_blocks,
                "disqualifier_blocks": ph.disqualifier_blocks,
                "max_bars": ph.max_bars,
            }
            for ph in p.phases
        ],
    }
