"""GET/POST /patterns/* — pattern engine API.

Heavy read paths and train/evaluate/promote run in worker threads via
`asyncio.to_thread` so the event loop stays responsive.

Mutations that touch the same ledger instance synchronously (verdict,
alert-policy PUT, register) stay on the async route without offloading.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel

from api.routes import patterns_thread
from capture.types import CaptureRecord
from ledger.store import LEDGER_RECORD_STORE, LedgerStore
from ledger.types import PatternOutcome
from patterns.alert_policy import ALERT_POLICY_STORE, PatternAlertPolicy
from patterns.library import PATTERN_LIBRARY, get_pattern
from patterns.registry import PATTERN_REGISTRY_STORE
from patterns.scanner import run_pattern_scan
from patterns.types import PatternObject, PhaseCondition
from scoring.block_evaluator import _BLOCKS

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


class _PatternAlertPolicyBody(BaseModel):
    mode: str


class _CaptureBody(BaseModel):
    symbol: str
    user_id: str | None = None
    phase: str = ""
    timeframe: str = "1h"
    capture_kind: str = "pattern_candidate"
    candidate_transition_id: str | None = None
    scan_id: str | None = None
    user_note: str | None = None
    chart_context: dict = {}
    feature_snapshot: dict | None = None
    block_scores: dict = {}
    outcome_id: str | None = None
    verdict_id: str | None = None


# ── Library & States ─────────────────────────────────────────────────────────

@router.get("/library")
async def list_patterns() -> dict:
    """List all patterns in the library."""
    return await asyncio.to_thread(patterns_thread.list_patterns_sync)


@router.get("/registry")
async def get_pattern_registry() -> dict:
    """Return the JSON-backed pattern registry (versioned metadata per slug)."""
    def _sync():
        entries = PATTERN_REGISTRY_STORE.list_all()
        return {
            "ok": True,
            "count": len(entries),
            "entries": [e.to_dict() for e in entries],
        }
    return await asyncio.to_thread(_sync)


@router.get("/states")
async def get_all_states() -> dict:
    """Current phase (rich) for all tracked symbols across all patterns."""
    return await asyncio.to_thread(patterns_thread.get_all_states_sync)


@router.get("/candidates")
async def get_all_candidates() -> dict:
    """Entry candidates across all patterns."""
    return await asyncio.to_thread(patterns_thread.get_all_candidates_sync)


# ── Scan ─────────────────────────────────────────────────────────────────────

@router.post("/scan")
async def trigger_pattern_scan(background_tasks: BackgroundTasks) -> dict:
    """Trigger a pattern scan cycle in background."""
    background_tasks.add_task(run_pattern_scan)
    return {"status": "scan_started", "patterns": list(PATTERN_LIBRARY.keys())}


# ── Bulk read (static paths before parameterised routes) ────────────────────

@router.get("/stats/all")
async def get_all_stats() -> dict:
    """Bulk ledger stats for all patterns — avoids N+1 fan-out from callers."""
    return await asyncio.to_thread(patterns_thread.get_all_stats_sync, _ledger)


# ── Per-pattern endpoints ────────────────────────────────────────────────────

@router.get("/{slug}/candidates")
async def get_candidates(slug: str) -> dict:
    """Entry candidates for a specific pattern."""
    return await asyncio.to_thread(patterns_thread.get_candidates_sync, slug)


@router.get("/{slug}/stats")
async def get_stats(slug: str) -> dict:
    """Ledger statistics for a pattern. v3: includes ML shadow readiness."""
    return await asyncio.to_thread(patterns_thread.get_stats_sync, slug, _ledger)


@router.get("/{slug}/training-records")
async def get_training_records(slug: str, limit: int = Query(default=25, ge=1, le=200)) -> dict:
    """Preview canonical training rows derived from the ledger."""
    return await asyncio.to_thread(patterns_thread.get_training_records_sync, slug, limit, _ledger)


@router.get("/{slug}/alert-policy")
async def get_alert_policy(slug: str) -> dict:
    """Return current alert policy for a pattern."""
    return await asyncio.to_thread(patterns_thread.get_alert_policy_sync, slug)


@router.put("/{slug}/alert-policy")
async def set_alert_policy(slug: str, body: _PatternAlertPolicyBody) -> dict:
    """Update current alert policy for a pattern."""
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None
    if body.mode not in {"shadow", "visible", "gated"}:
        raise HTTPException(status_code=400, detail="mode must be one of shadow|visible|gated")
    policy = PatternAlertPolicy(pattern_slug=slug, mode=body.mode)  # type: ignore[arg-type]
    ALERT_POLICY_STORE.save(policy)
    return {
        "ok": True,
        "pattern_slug": slug,
        "policy": policy.to_dict(),
    }


@router.get("/{slug}/model-registry")
async def get_model_registry(slug: str) -> dict:
    """Return the current registry snapshot for a pattern."""
    return await asyncio.to_thread(patterns_thread.get_model_registry_sync, slug)


@router.get("/{slug}/library")
async def get_pattern_def(slug: str) -> dict:
    """Return the pattern definition."""
    return await asyncio.to_thread(patterns_thread.get_pattern_def_sync, slug)


# ── Verdict & Evaluation ────────────────────────────────────────────────────

@router.post("/{slug}/verdict")
async def set_user_verdict(slug: str, body: _VerdictBody) -> dict:
    """Set user_verdict on the most recent outcome for (slug, symbol)."""
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None

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


# ── Capture Plane ────────────────────────────────────────────────────────────

@router.post("/{slug}/capture")
async def record_capture(slug: str, body: _CaptureBody) -> dict:
    """Record a Save Setup capture event into the ledger capture plane.

    Links the capture to a durable phase transition via candidate_transition_id
    so the full chain capture_id → transition_id → outcome_id → verdict is traceable.
    """
    try:
        get_pattern(slug)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Pattern not found: {slug}") from None

    capture = CaptureRecord(
        capture_kind=body.capture_kind,  # type: ignore[arg-type]
        user_id=body.user_id,
        symbol=body.symbol,
        pattern_slug=slug,
        phase=body.phase,
        timeframe=body.timeframe,
        candidate_transition_id=body.candidate_transition_id,
        scan_id=body.scan_id,
        user_note=body.user_note,
        chart_context=body.chart_context,
        feature_snapshot=body.feature_snapshot,
        block_scores=body.block_scores,
        outcome_id=body.outcome_id,
        verdict_id=body.verdict_id,
    )
    LEDGER_RECORD_STORE.append_capture_record(capture)
    return {
        "ok": True,
        "capture_id": capture.capture_id,
        "pattern_slug": slug,
        "symbol": body.symbol,
        "status": capture.status,
    }


@router.post("/{slug}/evaluate")
async def auto_evaluate(slug: str) -> dict:
    """v2: Auto-evaluate pending outcomes past their evaluation window."""
    return await asyncio.to_thread(patterns_thread.auto_evaluate_sync, slug, _ledger)


@router.post("/{slug}/train-model")
async def train_pattern_model(slug: str, body: _PatternTrainBody) -> dict:
    """Train a pattern-scoped model from durable ledger outcomes."""
    try:
        return await asyncio.to_thread(
            patterns_thread.train_pattern_model_sync,
            slug,
            body.model_dump(),
            _ledger,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{slug}/promote-model")
async def promote_pattern_model(slug: str, body: _PromotePatternModelBody) -> dict:
    """Promote a candidate model to active rollout state."""
    return await asyncio.to_thread(
        patterns_thread.promote_pattern_model_sync,
        slug,
        body.model_key,
        body.model_version,
        body.threshold_policy_version,
    )


# ── v2: Pattern Registration ────────────────────────────────────────────────

@router.post("/register")
async def register_pattern(body: _RegisterPatternBody) -> dict:
    """Register a user-defined pattern into the library."""
    known_blocks = {name for name, _ in _BLOCKS}

    phases = []
    for i, ph in enumerate(body.phases):
        required = ph.get("required_blocks", [])
        optional = ph.get("optional_blocks", [])
        disqualifiers = ph.get("disqualifier_blocks", [])

        all_refs = required + optional + disqualifiers
        unknown = [b for b in all_refs if b not in known_blocks]
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"Phase {i}: unknown blocks: {unknown}. Available: {sorted(known_blocks)}",
            )

        phases.append(
            PhaseCondition(
                phase_id=ph.get("phase_id", f"PHASE_{i}"),
                label=ph.get("label", f"Phase {i}"),
                required_blocks=required,
                optional_blocks=optional,
                disqualifier_blocks=disqualifiers,
                min_bars=ph.get("min_bars", 1),
                max_bars=ph.get("max_bars", 48),
                timeframe=ph.get("timeframe", body.timeframe),
            )
        )

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
