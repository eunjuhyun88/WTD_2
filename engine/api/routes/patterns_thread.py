"""Blocking /patterns read + train/evaluate/promote work for `asyncio.to_thread`."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

import time

from ledger.dataset import build_pattern_training_records, summarize_pattern_dataset
from ledger.store import LEDGER_RECORD_STORE, LedgerStore, _compute_stats_from_outcomes
from ledger.types import PatternLedgerRecord
from patterns.alert_policy import ALERT_POLICY_STORE
from patterns.definitions import PatternDefinitionService
from patterns.library import PATTERN_LIBRARY, get_pattern
from patterns.model_registry import MODEL_REGISTRY_STORE
from patterns.training_service import train_pattern_model_from_ledger
from patterns.scanner import (
    _get_machine,
    get_entry_candidates_all,
    get_entry_candidate_records,
    get_raw_entry_candidates_all,
    get_pattern_states,
)
from scoring.lightgbm_engine import get_engine


def _require_pattern(slug: str) -> None:
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None


def list_patterns_sync() -> dict:
    return {
        "patterns": [
            {
                "slug": p.slug,
                "name": p.name,
                "description": p.description,
                "tags": p.tags,
                "entry_phase": p.entry_phase,
                "target_phase": p.target_phase,
                "timeframe": p.timeframe,
                "n_phases": len(p.phases),
                "phases": [
                    {
                        "phase_id": ph.phase_id,
                        "label": ph.label,
                        "required_blocks": ph.required_blocks,
                        "n_required": len(ph.required_blocks),
                    }
                    for ph in p.phases
                ],
            }
            for p in PATTERN_LIBRARY.values()
        ]
    }


def get_all_states_sync() -> dict:
    patterns_rich: dict = {}
    for slug in PATTERN_LIBRARY:
        machine = _get_machine(slug)
        patterns_rich[slug] = machine.get_all_states_rich()
    return {"patterns": patterns_rich}


def get_all_candidates_sync() -> dict:
    candidates = get_entry_candidates_all()
    raw_candidates = get_raw_entry_candidates_all()
    records_by_pattern = get_entry_candidate_records()
    records = [
        record
        for pattern_records in records_by_pattern.values()
        for record in pattern_records
    ]
    total = sum(len(v) for v in candidates.values())
    return {
        "entry_candidates": candidates,
        "raw_entry_candidates": raw_candidates,
        "candidate_records": records,
        "candidate_records_by_pattern": records_by_pattern,
        "total_count": total,
    }


def get_candidates_sync(slug: str) -> dict:
    try:
        pattern = get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None
    states = get_pattern_states()
    pattern_states = states.get(slug, {})
    candidates = [
        sym for sym, phase in pattern_states.items() if phase == pattern.entry_phase
    ]
    records = get_entry_candidate_records(slug).get(slug, [])
    visible_candidates = [record["symbol"] for record in records if record.get("alert_visible")]
    return {
        "slug": slug,
        "entry_phase": pattern.entry_phase,
        "candidates": visible_candidates,
        "raw_candidates": candidates,
        "candidate_records": records,
        "count": len(visible_candidates),
    }


def _summarize_record_family(
    slug: str,
    *,
    record_store=None,
) -> tuple[dict[str, int | float | None], PatternLedgerRecord | None, PatternLedgerRecord | None]:
    store = record_store or LEDGER_RECORD_STORE
    summarize_family = getattr(store, "summarize_family", None)
    if callable(summarize_family):
        return summarize_family(slug)

    records = store.list(slug)
    counts = {
        "entry": 0,
        "capture": 0,
        "score": 0,
        "outcome": 0,
        "verdict": 0,
        "training_run": 0,
        "model": 0,
    }
    latest_training_run_record: PatternLedgerRecord | None = None
    latest_model_record: PatternLedgerRecord | None = None

    for record in records:
        record_type = record.record_type
        if record_type in counts:
            counts[record_type] += 1
        if latest_training_run_record is None and record_type == "training_run":
            latest_training_run_record = record
        if latest_model_record is None and record_type == "model":
            latest_model_record = record

    entry_count = counts["entry"]
    capture_count = counts["capture"]
    verdict_count = counts["verdict"]
    return (
        {
            "entry_count": entry_count,
            "capture_count": capture_count,
            "score_count": counts["score"],
            "outcome_count": counts["outcome"],
            "verdict_count": verdict_count,
            "training_run_count": counts["training_run"],
            "model_count": counts["model"],
            "capture_to_entry_rate": capture_count / entry_count if entry_count > 0 else None,
            "verdict_to_entry_rate": verdict_count / entry_count if entry_count > 0 else None,
        },
        latest_training_run_record,
        latest_model_record,
    )


def get_stats_sync(
    slug: str,
    ledger: LedgerStore,
    outcomes: list | None = None,
    *,
    record_store=None,
) -> dict:
    _require_pattern(slug)
    definition_ref = _resolve_definition_ref(slug)
    if outcomes is None:
        outcomes = ledger.list_all(slug)
    stats = _compute_stats_from_outcomes(slug, outcomes)
    record_family, latest_training_run_record, latest_model_record = _summarize_record_family(
        slug,
        record_store=record_store,
    )
    registry_entries = MODEL_REGISTRY_STORE.list(slug)
    active_registry_entry = MODEL_REGISTRY_STORE.get_active(slug)
    preferred_registry_entry = MODEL_REGISTRY_STORE.get_preferred_scoring_model(slug)
    ml_shadow = summarize_pattern_dataset(outcomes)
    alert_policy = ALERT_POLICY_STORE.load(slug)
    record_family_payload = (
        record_family
        if isinstance(record_family, dict)
        else {
            "entry_count": record_family.entry_count,
            "capture_count": record_family.capture_count,
            "score_count": record_family.score_count,
            "outcome_count": record_family.outcome_count,
            "verdict_count": record_family.verdict_count,
            "training_run_count": record_family.training_run_count,
            "model_count": record_family.model_count,
            "capture_to_entry_rate": record_family.capture_to_entry_rate,
            "verdict_to_entry_rate": record_family.verdict_to_entry_rate,
        }
    )
    return {
        "pattern_slug": stats.pattern_slug,
        "definition_ref": definition_ref,
        "total": stats.total_instances,
        "pending": stats.pending_count,
        "success": stats.success_count,
        "failure": stats.failure_count,
        "success_rate": round(stats.success_rate, 3),
        "avg_gain_pct": round(stats.avg_gain_pct, 3) if stats.avg_gain_pct is not None else None,
        "avg_loss_pct": round(stats.avg_loss_pct, 3) if stats.avg_loss_pct is not None else None,
        "expected_value": round(stats.expected_value, 4) if stats.expected_value is not None else None,
        "avg_duration_hours": round(stats.avg_duration_hours, 1) if stats.avg_duration_hours is not None else None,
        "recent_30d_count": stats.recent_30d_count,
        "recent_30d_success_rate": round(stats.recent_30d_success_rate, 3)
        if stats.recent_30d_success_rate is not None
        else None,
        "btc_conditional": {
            "bullish": round(stats.btc_bullish_rate, 3) if stats.btc_bullish_rate is not None else None,
            "bearish": round(stats.btc_bearish_rate, 3) if stats.btc_bearish_rate is not None else None,
            "sideways": round(stats.btc_sideways_rate, 3) if stats.btc_sideways_rate is not None else None,
        },
        "decay_direction": stats.decay_direction,
        "record_family": {
            "entry_count": record_family_payload["entry_count"],
            "capture_count": record_family_payload["capture_count"],
            "score_count": record_family_payload["score_count"],
            "outcome_count": record_family_payload["outcome_count"],
            "verdict_count": record_family_payload["verdict_count"],
            "training_run_count": record_family_payload["training_run_count"],
            "model_count": record_family_payload["model_count"],
            "capture_to_entry_rate": round(record_family_payload["capture_to_entry_rate"], 3)
            if record_family_payload["capture_to_entry_rate"] is not None
            else None,
            "verdict_to_entry_rate": round(record_family_payload["verdict_to_entry_rate"], 3)
            if record_family_payload["verdict_to_entry_rate"] is not None
            else None,
        },
        "model_registry": {
            "entry_count": len(registry_entries),
            "active_model": _registry_entry_payload(active_registry_entry) if active_registry_entry else None,
            "preferred_scoring_model": _registry_entry_payload(preferred_registry_entry) if preferred_registry_entry else None,
        },
        "alert_policy": alert_policy.to_dict(),
        "latest_training_run": _record_payload(latest_training_run_record, slug) if latest_training_run_record else None,
        "latest_model": _record_payload(latest_model_record, slug) if latest_model_record else None,
        "ml_shadow": {
            "total_entries": ml_shadow.total_entries,
            "decided_entries": ml_shadow.decided_entries,
            "state_counts": ml_shadow.state_counts,
            "scored_entries": ml_shadow.scored_entries,
            "scored_decided_entries": ml_shadow.scored_decided_entries,
            "score_coverage": round(ml_shadow.score_coverage, 3) if ml_shadow.score_coverage is not None else None,
            "avg_p_win": round(ml_shadow.avg_p_win, 4) if ml_shadow.avg_p_win is not None else None,
            "threshold_pass_count": ml_shadow.threshold_pass_count,
            "threshold_pass_rate": round(ml_shadow.threshold_pass_rate, 3)
            if ml_shadow.threshold_pass_rate is not None
            else None,
            "above_threshold_success_rate": round(ml_shadow.above_threshold_success_rate, 3)
            if ml_shadow.above_threshold_success_rate is not None
            else None,
            "below_threshold_success_rate": round(ml_shadow.below_threshold_success_rate, 3)
            if ml_shadow.below_threshold_success_rate is not None
            else None,
            "training_usable_count": ml_shadow.training_usable_count,
            "training_win_count": ml_shadow.training_win_count,
            "training_loss_count": ml_shadow.training_loss_count,
            "ready_to_train": ml_shadow.ready_to_train,
            "readiness_reason": ml_shadow.readiness_reason,
            "last_model_version": ml_shadow.last_model_version,
        },
    }


def get_all_stats_sync(ledger: LedgerStore) -> dict:
    """Return stats for all known patterns — batch-prefetch outcomes when possible.

    With SupabaseLedgerStore: 1 DB roundtrip (batch_list_all) vs 2N per-slug queries.
    With FileLedgerStore: falls back to per-slug reads (local dev unchanged).
    """
    t0 = time.perf_counter()
    prefetched: dict[str, list] | None = None
    if hasattr(ledger, "batch_list_all"):
        try:
            prefetched = ledger.batch_list_all()
        except Exception:
            prefetched = None

    results: dict[str, dict] = {}
    for slug in PATTERN_LIBRARY:
        try:
            outcomes = prefetched.get(slug, []) if prefetched is not None else None
            results[slug] = get_stats_sync(slug, ledger, outcomes=outcomes)
        except Exception:
            results[slug] = {"pattern_slug": slug, "error": "unavailable"}

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    import logging
    logging.getLogger("engine.patterns.stats").info(
        "get_all_stats_sync: %d patterns in %dms (batch=%s)",
        len(results), elapsed_ms, prefetched is not None,
    )
    return {"patterns": results, "count": len(results)}


def get_training_records_sync(slug: str, limit: int, ledger: LedgerStore) -> dict:
    _require_pattern(slug)
    outcomes = ledger.list_all(slug)
    records = build_pattern_training_records(outcomes)
    summary = summarize_pattern_dataset(outcomes)
    return {
        "pattern_slug": slug,
        "total_records": len(records),
        "ready_to_train": summary.ready_to_train,
        "readiness_reason": summary.readiness_reason,
        "records": records[:limit],
    }


def get_alert_policy_sync(slug: str) -> dict:
    _require_pattern(slug)
    policy = ALERT_POLICY_STORE.load(slug)
    return {
        "pattern_slug": slug,
        "policy": policy.to_dict(),
    }


def get_model_registry_sync(slug: str) -> dict:
    _require_pattern(slug)
    entries = MODEL_REGISTRY_STORE.list(slug)
    active_entry = MODEL_REGISTRY_STORE.get_active(slug)
    preferred_entry = MODEL_REGISTRY_STORE.get_preferred_scoring_model(slug)
    return {
        "pattern_slug": slug,
        "definition_ref": _resolve_definition_ref(slug),
        "entries": [_registry_entry_payload(entry) for entry in entries],
        "active_model": _registry_entry_payload(active_entry) if active_entry else None,
        "preferred_scoring_model": _registry_entry_payload(preferred_entry) if preferred_entry else None,
    }


def get_pattern_def_sync(slug: str) -> dict:
    try:
        p = get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None

    return {
        "slug": p.slug,
        "name": p.name,
        "description": p.description,
        "entry_phase": p.entry_phase,
        "target_phase": p.target_phase,
        "timeframe": p.timeframe,
        "tags": p.tags,
        "version": p.version,
        "created_by": p.created_by,
        "phases": [
            {
                "phase_id": ph.phase_id,
                "label": ph.label,
                "required_blocks": ph.required_blocks,
                "optional_blocks": ph.optional_blocks,
                "disqualifier_blocks": ph.disqualifier_blocks,
                "min_bars": ph.min_bars,
                "max_bars": ph.max_bars,
                "timeframe": ph.timeframe,
            }
            for ph in p.phases
        ],
    }


def auto_evaluate_sync(slug: str, ledger: LedgerStore) -> dict:
    _require_pattern(slug)
    evaluated = ledger.auto_evaluate_pending(slug)
    return {
        "slug": slug,
        "evaluated_count": len(evaluated),
        "results": [{"id": o.id, "symbol": o.symbol, "verdict": o.outcome} for o in evaluated],
    }


def train_pattern_model_sync(slug: str, body: dict[str, Any], ledger: LedgerStore) -> dict:
    _require_pattern(slug)
    definition_ref = _resolve_definition_ref(slug, definition_id=body.get("definition_id"))
    return train_pattern_model_from_ledger(
        slug,
        user_id=body.get("user_id"),
        definition_ref=definition_ref,
        target_name=body.get("target_name", "breakout"),
        feature_schema_version=body.get("feature_schema_version", 1),
        label_policy_version=body.get("label_policy_version", 1),
        threshold_policy_version=body.get("threshold_policy_version", 1),
        min_records=body.get("min_records"),
        ledger=ledger,
        record_store=LEDGER_RECORD_STORE,
        registry_store=MODEL_REGISTRY_STORE,
        get_engine_fn=get_engine,
    )


def promote_pattern_model_sync(
    slug: str,
    model_key: str,
    model_version: str,
    threshold_policy_version: int,
) -> dict:
    _require_pattern(slug)
    definition_ref = _resolve_definition_ref(slug)
    try:
        active_entry = MODEL_REGISTRY_STORE.promote(
            pattern_slug=slug,
            model_key=model_key,
            model_version=model_version,
            threshold_policy_version=threshold_policy_version,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    LEDGER_RECORD_STORE.append_model_record(
        pattern_slug=slug,
        model_version=active_entry.model_version,
        payload={
            "definition_ref": definition_ref,
            "model_key": active_entry.model_key,
            "timeframe": active_entry.timeframe,
            "target_name": active_entry.target_name,
            "feature_schema_version": active_entry.feature_schema_version,
            "label_policy_version": active_entry.label_policy_version,
            "threshold_policy_version": active_entry.threshold_policy_version,
            "rollout_state": active_entry.rollout_state,
            "promotion_event": "promote_to_active",
        },
    )

    return {
        "ok": True,
        "pattern_slug": slug,
        "definition_ref": definition_ref,
        "active_model": active_entry.to_dict(),
    }


def _resolve_definition_ref(slug: str, *, definition_id: str | None = None) -> dict[str, Any]:
    service = PatternDefinitionService()
    if definition_id:
        parsed = service.parse_definition_id(definition_id)
        return (
            service.get_definition_ref(
                pattern_slug=parsed["pattern_slug"],
                pattern_version=parsed["pattern_version"],
            )
            or parsed
        )
    return service.get_definition_ref(pattern_slug=slug) or {"pattern_slug": slug}


def _registry_entry_payload(entry) -> dict[str, Any]:
    payload = entry.to_dict()
    payload["definition_ref"] = _resolve_definition_ref(entry.pattern_slug)
    return payload


def _record_payload(record: PatternLedgerRecord, slug: str) -> dict[str, Any]:
    payload = record.to_dict()
    record_payload = payload.get("payload")
    record_payload = record_payload if isinstance(record_payload, dict) else {}
    definition_ref = record_payload.get("definition_ref")
    if not isinstance(definition_ref, dict) or not definition_ref:
        definition_ref = _resolve_definition_ref(slug)
    payload["definition_ref"] = definition_ref
    return payload
