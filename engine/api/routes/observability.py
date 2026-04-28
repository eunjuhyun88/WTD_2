"""Observability — flywheel health KPIs.

Design: docs/product/flywheel-closure-design.md §Observability.

Exposes the 6 KPIs that define whether the pattern flywheel is actually
running — not whether the plumbing compiles. Used by the CTO dashboard
and by downstream go/no-go decisions on Phase C/D work.

  captures_per_day_7d           axis 1 — is any data entering?
  captures_to_outcome_rate      axis 1→2 — is resolver closing captures?
  outcomes_to_verdict_rate      axis 2→3 — are users labelling?
  verdicts_to_refinement_count_7d  axis 3→4 — is refinement firing?
  active_models_per_pattern     axis 4 — is the registry non-empty?
  promotion_gate_pass_rate_30d  axis 4 — are refinements promoting?
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter

from capture.store import CaptureStore
from ledger.store import LEDGER_RECORD_STORE
from ledger.types import PatternLedgerRecord
from patterns.library import PATTERN_LIBRARY
from patterns.model_registry import PatternModelRegistryStore

router = APIRouter()

_capture_store = CaptureStore()
_model_registry = PatternModelRegistryStore()


def _iter_all_records(*, record_store=None) -> list[PatternLedgerRecord]:
    """Iterate LEDGER records across every known pattern slug."""
    store = record_store or LEDGER_RECORD_STORE
    records: list[PatternLedgerRecord] = []
    slug_lister = getattr(store, "list_pattern_slugs", None)
    if callable(slug_lister):
        slugs = slug_lister()
    else:
        base = getattr(store, "base_dir", None)
        if base is None or not base.exists():
            return records
        slugs = [slug_dir.name for slug_dir in base.iterdir() if slug_dir.is_dir()]

    if not slugs:
        return records
    for slug in slugs:
        records.extend(store.list(slug))
    return records


def _count_within(records: list[PatternLedgerRecord], *, record_type: str, since: datetime) -> int:
    return sum(
        1
        for r in records
        if r.record_type == record_type and r.created_at and r.created_at >= since
    )


def _count_records(*, record_type: str, since: datetime | None = None, record_store=None) -> int:
    store = record_store or LEDGER_RECORD_STORE
    counter = getattr(store, "count_records", None)
    if callable(counter):
        return int(counter(record_type=record_type, since=since))
    if since is None:
        return sum(1 for r in _iter_all_records(record_store=store) if r.record_type == record_type)
    return _count_within(
        _iter_all_records(record_store=store),
        record_type=record_type,
        since=since,
    )


def compute_flywheel_health(
    *,
    now: datetime | None = None,
    capture_store: CaptureStore | None = None,
    record_store=None,
    model_registry: PatternModelRegistryStore | None = None,
    pattern_library=None,
) -> dict[str, Any]:
    """Compute the 6 flywheel KPIs. Pure function for testability."""
    now = now or datetime.now()
    since_7d = now - timedelta(days=7)
    since_30d = now - timedelta(days=30)
    capture_store = capture_store or _capture_store
    record_store = record_store or LEDGER_RECORD_STORE
    model_registry = model_registry or _model_registry
    pattern_library = pattern_library or PATTERN_LIBRARY

    # axis 1: captures per day (rolling 7d)
    captures_7d = _count_records(record_type="capture", since=since_7d, record_store=record_store)
    captures_per_day_7d = captures_7d / 7.0

    # axis 1→2: share of captures that have been resolved by the outcome resolver.
    status_counts = capture_store.count_by_status()
    resolved_count = status_counts.get("outcome_ready", 0) + status_counts.get("verdict_ready", 0)
    total_captures = sum(status_counts.values())
    captures_to_outcome_rate = (
        resolved_count / total_captures if total_captures else 0.0
    )

    # axis 2→3: outcomes that received a user_verdict.
    outcome_count = _count_records(record_type="outcome", record_store=record_store)
    verdict_count = _count_records(record_type="verdict", record_store=record_store)
    outcomes_to_verdict_rate = (
        verdict_count / outcome_count if outcome_count else 0.0
    )

    # axis 3→4: refinement / training_run ledger counts in the last 7 days.
    verdicts_to_refinement_count_7d = _count_records(
        record_type="training_run",
        since=since_7d,
        record_store=record_store,
    )

    # axis 4: model registry non-empty?
    active_models_per_pattern: dict[str, int] = {}
    for slug in pattern_library:
        active = model_registry.get_active(slug)
        active_models_per_pattern[slug] = 1 if active is not None else 0

    # axis 4: promotion gate pass rate (derive from model records written in
    # the last 30 days vs training_run records in the same window).
    training_30d = _count_records(
        record_type="training_run",
        since=since_30d,
        record_store=record_store,
    )
    model_30d = _count_records(
        record_type="model",
        since=since_30d,
        record_store=record_store,
    )
    promotion_gate_pass_rate_30d = (
        model_30d / training_30d if training_30d else 0.0
    )

    return {
        "captures_per_day_7d": round(captures_per_day_7d, 4),
        "captures_to_outcome_rate": round(captures_to_outcome_rate, 4),
        "outcomes_to_verdict_rate": round(outcomes_to_verdict_rate, 4),
        "verdicts_to_refinement_count_7d": verdicts_to_refinement_count_7d,
        "active_models_per_pattern": active_models_per_pattern,
        "promotion_gate_pass_rate_30d": round(promotion_gate_pass_rate_30d, 4),
    }


@router.get("/flywheel/health")
async def flywheel_health() -> dict[str, Any]:
    return {"ok": True, **compute_flywheel_health()}


@router.get("/agent-status")
async def agent_status() -> dict[str, Any]:
    """Real-time harness observability — scheduler jobs + pattern scan state.

    Feeds the /status page and CI canary checks.
    Returns scheduler job list + flywheel health without full KPI compute.
    """
    from scanner.scheduler import get_jobs_status, is_running, next_run_time
    from patterns.scanner import _REPLAYED, _MACHINES

    jobs = get_jobs_status()
    return {
        "scheduler": {
            "running": is_running(),
            "next_universe_scan": next_run_time(),
            "job_count": len(jobs),
            "jobs": jobs,
        },
        "pattern_engine": {
            "loaded_machines": len(_MACHINES),
            "replayed_symbols": len(_REPLAYED),
        },
        "flywheel": compute_flywheel_health(),
        "ts": datetime.utcnow().isoformat() + "Z",
    }
