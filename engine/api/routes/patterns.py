"""GET/POST /patterns/* — pattern engine API.

Endpoints:
  GET  /patterns/library              — list all patterns
  GET  /patterns/states               — all pattern states (symbol → phase)
  GET  /patterns/candidates           — entry candidates across all patterns
  GET  /patterns/{slug}/candidates    — entry candidates for one pattern
  GET  /patterns/{slug}/stats         — ledger stats for one pattern
  GET  /patterns/{slug}/model-registry — current registry snapshot for one pattern
  GET  /patterns/{slug}/library       — return pattern definition
  POST /patterns/scan                 — trigger a scan cycle
  POST /patterns/{slug}/verdict       — user verdict on outcome
  POST /patterns/{slug}/evaluate      — v2: auto-evaluate pending outcomes
  POST /patterns/{slug}/promote-model — promote a candidate model to active
  POST /patterns/register             — v2: register user-defined pattern
  GET  /patterns/data-quality         — v2: perp coverage and scan health
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel

from ledger.dataset import build_pattern_training_records, summarize_pattern_dataset
from ledger.store import LEDGER_RECORD_STORE, LedgerStore
from ledger.types import PatternOutcome
from patterns.library import PATTERN_LIBRARY, get_pattern
from patterns.model_key import make_pattern_model_key
from patterns.model_registry import MODEL_REGISTRY_STORE
from patterns.scanner import (
    _get_machine,
    get_entry_candidates_all,
    get_entry_candidate_records,
    get_pattern_states,
    run_pattern_scan,
)
from scoring.feature_matrix import encode_features_df
from scoring.lightgbm_engine import MIN_TRAIN_RECORDS, get_engine

router = APIRouter()
_ledger = LedgerStore()


# ── Request models ───────────────────────────────────────────────────────────

class _VerdictBody(BaseModel):
    symbol: str
    verdict: str  # "valid" | "invalid" | "missed"

class _RegisterPatternBody(BaseModel):
    slug: str
    name: str
    description: str
    phases: list[dict]  # [{phase_id, label, required_blocks, ...}]
    entry_phase: str
    target_phase: str
    timeframe: str = "1h"
    tags: list[str] = []


class _PatternTrainBody(BaseModel):
    user_id: str | None = None
    target_name: str = "breakout"
    feature_schema_version: int = 1
    label_policy_version: int = 1
    threshold_policy_version: int = 1
    min_records: int | None = None


class _PromotePatternModelBody(BaseModel):
    model_key: str
    model_version: str
    threshold_policy_version: int = 1


def _pattern_training_matrix(records: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    snapshots = [record["snapshot"] for record in records]
    labels = np.array([int(record["outcome"]) for record in records], dtype=int)
    X = encode_features_df(pd.DataFrame(snapshots))
    return X, labels


# ── Library & States ─────────────────────────────────────────────────────────

@router.get("/library")
async def list_patterns() -> dict:
    """List all patterns in the library."""
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


@router.get("/states")
async def get_all_states() -> dict:
    """Current phase (rich) for all tracked symbols across all patterns."""
    patterns_rich: dict = {}
    for slug in PATTERN_LIBRARY:
        machine = _get_machine(slug)
        patterns_rich[slug] = machine.get_all_states_rich()
    return {"patterns": patterns_rich}


@router.get("/candidates")
async def get_all_candidates() -> dict:
    """Entry candidates across all patterns."""
    candidates = get_entry_candidates_all()
    records_by_pattern = get_entry_candidate_records()
    records = [
        record
        for pattern_records in records_by_pattern.values()
        for record in pattern_records
    ]
    total = sum(len(v) for v in candidates.values())
    return {
        "entry_candidates": candidates,
        "candidate_records": records,
        "candidate_records_by_pattern": records_by_pattern,
        "total_count": total,
    }


# ── Scan ─────────────────────────────────────────────────────────────────────

@router.post("/scan")
async def trigger_pattern_scan(background_tasks: BackgroundTasks) -> dict:
    """Trigger a pattern scan cycle in background."""
    background_tasks.add_task(run_pattern_scan)
    return {"status": "scan_started", "patterns": list(PATTERN_LIBRARY.keys())}


# ── Per-pattern endpoints ────────────────────────────────────────────────────

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
    records = get_entry_candidate_records(slug).get(slug, [])
    return {
        "slug": slug,
        "entry_phase": pattern.entry_phase,
        "candidates": candidates,
        "candidate_records": records,
        "count": len(candidates),
    }


@router.get("/{slug}/stats")
async def get_stats(slug: str) -> dict:
    """Ledger statistics for a pattern. v3: includes ML shadow readiness."""
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}")

    stats = _ledger.compute_stats(slug)
    outcomes = _ledger.list_all(slug)
    record_family = LEDGER_RECORD_STORE.compute_family_stats(slug)
    registry_entries = MODEL_REGISTRY_STORE.list(slug)
    active_registry_entry = MODEL_REGISTRY_STORE.get_active(slug)
    preferred_registry_entry = MODEL_REGISTRY_STORE.get_preferred_scoring_model(slug)
    latest_training_run_record = next(
        iter(LEDGER_RECORD_STORE.list(slug, record_type="training_run", limit=1)),
        None,
    )
    latest_model_record = next(iter(LEDGER_RECORD_STORE.list(slug, record_type="model", limit=1)), None)
    ml_shadow = summarize_pattern_dataset(outcomes)
    return {
        "pattern_slug": stats.pattern_slug,
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
        "recent_30d_success_rate": round(stats.recent_30d_success_rate, 3) if stats.recent_30d_success_rate is not None else None,
        # v2: BTC-conditional
        "btc_conditional": {
            "bullish": round(stats.btc_bullish_rate, 3) if stats.btc_bullish_rate is not None else None,
            "bearish": round(stats.btc_bearish_rate, 3) if stats.btc_bearish_rate is not None else None,
            "sideways": round(stats.btc_sideways_rate, 3) if stats.btc_sideways_rate is not None else None,
        },
        "decay_direction": stats.decay_direction,
        "record_family": {
            "entry_count": record_family.entry_count,
            "capture_count": record_family.capture_count,
            "score_count": record_family.score_count,
            "outcome_count": record_family.outcome_count,
            "verdict_count": record_family.verdict_count,
            "training_run_count": record_family.training_run_count,
            "model_count": record_family.model_count,
            "capture_to_entry_rate": round(record_family.capture_to_entry_rate, 3) if record_family.capture_to_entry_rate is not None else None,
            "verdict_to_entry_rate": round(record_family.verdict_to_entry_rate, 3) if record_family.verdict_to_entry_rate is not None else None,
        },
        "model_registry": {
            "entry_count": len(registry_entries),
            "active_model": active_registry_entry.to_dict() if active_registry_entry else None,
            "preferred_scoring_model": preferred_registry_entry.to_dict() if preferred_registry_entry else None,
        },
        "latest_training_run": latest_training_run_record.to_dict() if latest_training_run_record else None,
        "latest_model": latest_model_record.to_dict() if latest_model_record else None,
        "ml_shadow": {
            "total_entries": ml_shadow.total_entries,
            "decided_entries": ml_shadow.decided_entries,
            "state_counts": ml_shadow.state_counts,
            "scored_entries": ml_shadow.scored_entries,
            "scored_decided_entries": ml_shadow.scored_decided_entries,
            "score_coverage": round(ml_shadow.score_coverage, 3) if ml_shadow.score_coverage is not None else None,
            "avg_p_win": round(ml_shadow.avg_p_win, 4) if ml_shadow.avg_p_win is not None else None,
            "threshold_pass_count": ml_shadow.threshold_pass_count,
            "threshold_pass_rate": round(ml_shadow.threshold_pass_rate, 3) if ml_shadow.threshold_pass_rate is not None else None,
            "above_threshold_success_rate": round(ml_shadow.above_threshold_success_rate, 3) if ml_shadow.above_threshold_success_rate is not None else None,
            "below_threshold_success_rate": round(ml_shadow.below_threshold_success_rate, 3) if ml_shadow.below_threshold_success_rate is not None else None,
            "training_usable_count": ml_shadow.training_usable_count,
            "training_win_count": ml_shadow.training_win_count,
            "training_loss_count": ml_shadow.training_loss_count,
            "ready_to_train": ml_shadow.ready_to_train,
            "readiness_reason": ml_shadow.readiness_reason,
            "last_model_version": ml_shadow.last_model_version,
        },
    }


@router.get("/{slug}/training-records")
async def get_training_records(slug: str, limit: int = Query(default=25, ge=1, le=200)) -> dict:
    """Preview canonical training rows derived from the ledger."""
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}")

    outcomes = _ledger.list_all(slug)
    records = build_pattern_training_records(outcomes)
    summary = summarize_pattern_dataset(outcomes)
    return {
        "pattern_slug": slug,
        "total_records": len(records),
        "ready_to_train": summary.ready_to_train,
        "readiness_reason": summary.readiness_reason,
        "records": records[:limit],
    }


@router.get("/{slug}/model-registry")
async def get_model_registry(slug: str) -> dict:
    """Return the current registry snapshot for a pattern."""
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}")

    entries = MODEL_REGISTRY_STORE.list(slug)
    active_entry = MODEL_REGISTRY_STORE.get_active(slug)
    preferred_entry = MODEL_REGISTRY_STORE.get_preferred_scoring_model(slug)
    return {
        "pattern_slug": slug,
        "entries": [entry.to_dict() for entry in entries],
        "active_model": active_entry.to_dict() if active_entry else None,
        "preferred_scoring_model": preferred_entry.to_dict() if preferred_entry else None,
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


# ── Verdict & Evaluation ────────────────────────────────────────────────────

@router.post("/{slug}/verdict")
async def set_user_verdict(slug: str, body: _VerdictBody) -> dict:
    """Set user_verdict on the most recent outcome for (slug, symbol)."""
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}")

    # Find the most recent pending outcome for this symbol
    pending = _ledger.list_pending(slug)
    matching = [o for o in pending if o.symbol == body.symbol]

    if not matching:
        all_outcomes = _ledger.list_all(slug)
        matching = [o for o in all_outcomes if o.symbol == body.symbol]

    if not matching:
        new_outcome = PatternOutcome(
            pattern_slug=slug,
            symbol=body.symbol,
            user_verdict=body.verdict,  # type: ignore[arg-type]
        )
        _ledger.save(new_outcome)
        LEDGER_RECORD_STORE.append_verdict_record(new_outcome)
        return {"ok": True, "created": True, "outcome_id": new_outcome.id}

    outcome = matching[0]
    outcome.user_verdict = body.verdict  # type: ignore[assignment]
    _ledger.save(outcome)
    LEDGER_RECORD_STORE.append_verdict_record(outcome)
    return {"ok": True, "outcome_id": outcome.id}


@router.post("/{slug}/evaluate")
async def auto_evaluate(slug: str) -> dict:
    """v2: Auto-evaluate pending outcomes past their evaluation window.

    Checks Binance prices and applies HIT/MISS/EXPIRED verdicts.
    """
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}")

    evaluated = _ledger.auto_evaluate_pending(slug)
    return {
        "slug": slug,
        "evaluated_count": len(evaluated),
        "results": [
            {"id": o.id, "symbol": o.symbol, "verdict": o.outcome}
            for o in evaluated
        ],
    }


@router.post("/{slug}/train-model")
async def train_pattern_model(slug: str, body: _PatternTrainBody) -> dict:
    """Train a pattern-scoped model from durable ledger outcomes."""
    try:
        pattern = get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}")

    outcomes = _ledger.list_all(slug)
    records = build_pattern_training_records(outcomes)
    required_records = max(MIN_TRAIN_RECORDS, body.min_records or MIN_TRAIN_RECORDS)
    if len(records) < required_records:
        raise HTTPException(
            status_code=400,
            detail=f"Need ≥{required_records} training records (got {len(records)})",
        )

    X, y = _pattern_training_matrix(records)
    if len(set(y.tolist())) < 2:
        raise HTTPException(
            status_code=400,
            detail="Need at least one success and one failure outcome",
        )

    model_key = make_pattern_model_key(
        slug,
        pattern.timeframe,
        body.target_name,
        body.feature_schema_version,
        body.label_policy_version,
    )
    engine = get_engine(model_key)
    result = engine.train(X, y)

    model_version = (
        result["model_version"]
        if result["replaced"] and result["model_version"]
        else ("not_replaced" if not result["replaced"] else "untrained")
    )
    payload = {
        "model_key": model_key,
        "timeframe": pattern.timeframe,
        "target_name": body.target_name,
        "feature_schema_version": body.feature_schema_version,
        "label_policy_version": body.label_policy_version,
        "threshold_policy_version": body.threshold_policy_version,
        "requested_by_user_id": body.user_id,
        "n_records": len(records),
        "n_wins": int((y == 1).sum()),
        "n_losses": int((y == 0).sum()),
        "auc": result["auc"],
        "replaced": result["replaced"],
        "rollout_state": "candidate" if result["replaced"] else "shadow",
        "fold_aucs": result["fold_aucs"],
    }
    LEDGER_RECORD_STORE.append_training_run_record(
        pattern_slug=slug,
        model_key=model_key,
        user_id=body.user_id,
        payload=payload,
    )
    if result["replaced"]:
        registry_entry = MODEL_REGISTRY_STORE.upsert_candidate(
            pattern_slug=slug,
            model_key=model_key,
            model_version=model_version,
            timeframe=pattern.timeframe,
            target_name=body.target_name,
            feature_schema_version=body.feature_schema_version,
            label_policy_version=body.label_policy_version,
            threshold_policy_version=body.threshold_policy_version,
            requested_by_user_id=body.user_id,
        )
        LEDGER_RECORD_STORE.append_model_record(
            pattern_slug=slug,
            model_version=model_version,
            user_id=body.user_id,
            payload={
                **payload,
                "rollout_state": registry_entry.rollout_state,
            },
        )

    return {
        "ok": True,
        "pattern_slug": slug,
        "model_key": model_key,
        "model_version": model_version,
        "rollout_state": payload["rollout_state"],
        "replaced": result["replaced"],
        "training_run_recorded": True,
        "model_recorded": bool(result["replaced"]),
        "auc": result["auc"],
        "n_records": len(records),
        "n_wins": payload["n_wins"],
        "n_losses": payload["n_losses"],
    }


@router.post("/{slug}/promote-model")
async def promote_pattern_model(slug: str, body: _PromotePatternModelBody) -> dict:
    """Promote a candidate model to active rollout state."""
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}")

    try:
        active_entry = MODEL_REGISTRY_STORE.promote(
            pattern_slug=slug,
            model_key=body.model_key,
            model_version=body.model_version,
            threshold_policy_version=body.threshold_policy_version,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    LEDGER_RECORD_STORE.append_model_record(
        pattern_slug=slug,
        model_version=active_entry.model_version,
        payload={
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
        "active_model": active_entry.to_dict(),
    }


# ── v2: Pattern Registration ────────────────────────────────────────────────

@router.post("/register")
async def register_pattern(body: _RegisterPatternBody) -> dict:
    """Register a user-defined pattern into the library.

    Validates block names against the block evaluator registry.
    """
    from patterns.types import PatternObject, PhaseCondition
    from scoring.block_evaluator import _BLOCKS

    known_blocks = {name for name, _ in _BLOCKS}

    # Validate phases
    phases = []
    for i, ph in enumerate(body.phases):
        required = ph.get("required_blocks", [])
        optional = ph.get("optional_blocks", [])
        disqualifiers = ph.get("disqualifier_blocks", [])

        # Check all referenced blocks exist
        all_refs = required + optional + disqualifiers
        unknown = [b for b in all_refs if b not in known_blocks]
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Phase {i}: unknown blocks: {unknown}. Available: {sorted(known_blocks)}",
            )

        phases.append(PhaseCondition(
            phase_id=ph.get("phase_id", f"PHASE_{i}"),
            label=ph.get("label", f"Phase {i}"),
            required_blocks=required,
            optional_blocks=optional,
            disqualifier_blocks=disqualifiers,
            min_bars=ph.get("min_bars", 1),
            max_bars=ph.get("max_bars", 48),
            timeframe=ph.get("timeframe", body.timeframe),
        ))

    # Validate entry/target phases exist
    phase_ids = {p.phase_id for p in phases}
    if body.entry_phase not in phase_ids:
        raise HTTPException(400, f"entry_phase '{body.entry_phase}' not in phases: {phase_ids}")
    if body.target_phase not in phase_ids:
        raise HTTPException(400, f"target_phase '{body.target_phase}' not in phases: {phase_ids}")

    if body.slug in PATTERN_LIBRARY:
        raise HTTPException(409, f"Pattern '{body.slug}' already exists")

    pattern = PatternObject(
        slug=body.slug,
        name=body.name,
        description=body.description,
        phases=phases,
        entry_phase=body.entry_phase,
        target_phase=body.target_phase,
        timeframe=body.timeframe,
        tags=body.tags,
        created_by="user",
    )

    PATTERN_LIBRARY[body.slug] = pattern
    return {"ok": True, "slug": body.slug, "n_phases": len(phases)}
