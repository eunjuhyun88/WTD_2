"""Capture endpoints — canonical Save Setup records.

Routes:
  POST /captures                      single capture (pattern_candidate, manual_hypothesis, ...)
  POST /captures/bulk_import          founder cold-start: bulk-ingest manual hypothesis setups
  GET  /captures/outcomes             Verdict Inbox — captures with status='outcome_ready'
  POST /captures/{id}/verdict         apply user verdict to a resolved capture (Phase C)
  GET  /captures/{id}
  GET  /captures

Cold-start lane (design: docs/product/flywheel-closure-design.md):
  - manual_hypothesis captures enter with status='pending_outcome' so the
    outcome_resolver closes them via the same pipeline as pattern_candidate.
  - Bulk import is the founder's seed lane before external users arrive.
  - Verdict label closes axis 3: founder reviews resolved outcomes and
    annotates them as valid/invalid/near_miss/too_early/too_late so axis 4 (refinement) can train.

Verdict Inbox (W-0088 Phase C, flywheel axis 3):
  - outcome_resolver flips pending_outcome → outcome_ready once the
    evaluation window elapses and a PatternOutcome is computed.
  - GET /captures/outcomes returns these resolved-but-unverified captures
    joined with their PatternOutcome payload so the founder can review.
  - POST /captures/{id}/verdict writes user_verdict back to the
    PatternOutcome, appends LEDGER:verdict, and flips the capture to
    status='verdict_ready' — closing flywheel axis 3.
"""
from __future__ import annotations

import asyncio
from dataclasses import asdict, replace
import logging
import time
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator

from api.schemas_pattern_draft import ParserMetaBody, PatternDraftBody
from capture.store import CaptureStore, now_ms
from capture.types import CaptureKind, CaptureRecord
from ledger.store import LEDGER_RECORD_STORE, LedgerStore, get_ledger_store, validate_pattern_slug
from patterns.state_store import PatternStateStore
from research.manual_hypothesis_pack_builder import (
    ManualHypothesisBenchmarkPackError,
    build_manual_hypothesis_benchmark_pack_draft,
)
from research.pattern_search import (
    BenchmarkPackStore,
    PatternBenchmarkSearchConfig,
    PatternSearchArtifactStore,
    run_pattern_benchmark_search,
)
from patterns.active_variant_registry import ACTIVE_PATTERN_VARIANT_STORE
from research.query_transformer import transform_pattern_draft
from capture.token import sign_verdict_token, verdict_deeplink_url
from api.middleware.tier_gate import TierInfo, tier_gate, check_and_increment_quota

log = logging.getLogger("engine.captures")

router = APIRouter()
_capture_store = CaptureStore()
_state_store = PatternStateStore()
_ledger_store = get_ledger_store()
_benchmark_pack_store = BenchmarkPackStore()
_pattern_search_artifact_store = PatternSearchArtifactStore()

# Literal alias documents the accepted values and lets pydantic validate.
# 5-cat verdict (F-02): valid / invalid / near_miss / too_early / too_late
VerdictLabel = Literal["valid", "invalid", "near_miss", "too_early", "too_late"]


def _status_for_kind(kind: CaptureKind) -> str:
    """Lifecycle status assigned at ingest time.

    pattern_candidate and manual_hypothesis enter the resolver pipeline.
    chart_bookmark and post_trade_review are terminal on write (no
    outcome to compute).
    """
    if kind in ("pattern_candidate", "manual_hypothesis"):
        return "pending_outcome"
    return "closed"


class ResearchSourceBody(BaseModel):
    kind: Literal["telegram_post", "chart_image", "manual_note", "terminal_capture"]
    author: str | None = None
    title: str | None = None
    text: str | None = None
    image_refs: list[str] = Field(default_factory=list, max_length=12)


class ResearchPhaseAnnotationBody(BaseModel):
    phase_id: str
    label: str
    timeframe: str
    start_ts: int | None = None
    end_ts: int | None = None
    signals_required: list[str] = Field(default_factory=list, max_length=24)
    signals_preferred: list[str] = Field(default_factory=list, max_length=24)
    signals_forbidden: list[str] = Field(default_factory=list, max_length=24)
    note: str | None = None


class ResearchEntrySpecBody(BaseModel):
    entry_phase_id: str
    entry_trigger: str | None = None
    stop_rule: str | None = None
    target_rule: str | None = None


class ResearchOutcomeSpecBody(BaseModel):
    confirm_breakout_within_bars: int | None = None
    min_forward_return_pct: float | None = None
    stretch_return_pct: float | None = None


class ResearchContextBody(BaseModel):
    source: ResearchSourceBody | None = None
    pattern_family: str | None = None
    thesis: list[str] = Field(default_factory=list, max_length=12)
    phase_annotations: list[ResearchPhaseAnnotationBody] = Field(default_factory=list, max_length=12)
    entry_spec: ResearchEntrySpecBody | None = None
    outcome_spec: ResearchOutcomeSpecBody | None = None
    research_tags: list[str] = Field(default_factory=list, max_length=24)
    pattern_draft: PatternDraftBody | None = None
    parser_meta: ParserMetaBody | None = None

    @model_validator(mode="after")
    def validate_pattern_family(self) -> "ResearchContextBody":
        draft_family = self.pattern_draft.pattern_family if self.pattern_draft is not None else None
        if not self.pattern_family and not draft_family:
            raise ValueError("research_context requires pattern_family or pattern_draft.pattern_family")
        if self.pattern_family and draft_family and self.pattern_family != draft_family:
            raise ValueError("research_context pattern_family must match pattern_draft.pattern_family")
        return self


class CaptureCreateBody(BaseModel):
    capture_kind: CaptureKind = "pattern_candidate"
    symbol: str
    pattern_slug: str = ""
    pattern_version: int = 1
    phase: str = ""
    timeframe: str = "1h"
    candidate_transition_id: str | None = None
    candidate_id: str | None = None
    scan_id: str | None = None
    user_note: str | None = None
    chart_context: dict[str, Any] = Field(default_factory=dict)
    research_context: ResearchContextBody | None = None
    feature_snapshot: dict[str, Any] | None = None
    block_scores: dict[str, Any] = Field(default_factory=dict)


def _validate_transition(body: CaptureCreateBody) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    if body.capture_kind != "pattern_candidate":
        return None, {}
    try:
        body.pattern_slug = validate_pattern_slug(body.pattern_slug)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not body.candidate_transition_id:
        raise HTTPException(
            status_code=400,
            detail="candidate_transition_id is required for pattern_candidate captures",
        )
    transition = _state_store.get_transition(body.candidate_transition_id)
    if transition is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown candidate_transition_id: {body.candidate_transition_id}",
        )
    mismatches: dict[str, tuple[Any, Any]] = {}
    expected = {
        "symbol": transition.symbol,
        "pattern_slug": transition.pattern_slug,
        "pattern_version": transition.pattern_version,
        "phase": transition.to_phase,
        "timeframe": transition.timeframe,
    }
    actual = {
        "symbol": body.symbol,
        "pattern_slug": body.pattern_slug,
        "pattern_version": body.pattern_version,
        "phase": body.phase,
        "timeframe": body.timeframe,
    }
    for key, expected_value in expected.items():
        if actual[key] != expected_value:
            mismatches[key] = (actual[key], expected_value)
    if mismatches:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Capture context does not match referenced transition",
                "mismatches": mismatches,
            },
        )
    return transition.feature_snapshot, {
        "scan_id": transition.scan_id,
        "block_scores": transition.block_scores,
    }


def _normalize_research_context(
    research_context: ResearchContextBody | None,
    *,
    default_timeframe: str,
) -> dict[str, Any] | None:
    if research_context is None:
        return None
    payload = research_context.model_dump(mode="python", exclude_none=True)
    pattern_draft = payload.get("pattern_draft")
    if not isinstance(pattern_draft, dict):
        return payload

    if not payload.get("pattern_family") and isinstance(pattern_draft.get("pattern_family"), str):
        payload["pattern_family"] = pattern_draft["pattern_family"]

    if payload.get("source") is None:
        source_type = pattern_draft.get("source_type")
        if isinstance(source_type, str) and source_type:
            payload["source"] = {
                "kind": source_type,
                "text": pattern_draft.get("source_text") if isinstance(pattern_draft.get("source_text"), str) else None,
            }

    if not payload.get("thesis") and isinstance(pattern_draft.get("thesis"), list):
        payload["thesis"] = [item for item in pattern_draft["thesis"] if isinstance(item, str)][:12]

    if not payload.get("phase_annotations") and isinstance(pattern_draft.get("phases"), list):
        draft_timeframe = pattern_draft.get("timeframe")
        projected_timeframe = draft_timeframe if isinstance(draft_timeframe, str) and draft_timeframe else default_timeframe
        payload["phase_annotations"] = [
            {
                "phase_id": phase.get("phase_id"),
                "label": phase.get("label"),
                "timeframe": phase.get("timeframe") if isinstance(phase.get("timeframe"), str) and phase.get("timeframe") else projected_timeframe,
                "signals_required": [
                    item for item in phase.get("signals_required", []) if isinstance(item, str)
                ][:24],
                "signals_preferred": [
                    item for item in phase.get("signals_preferred", []) if isinstance(item, str)
                ][:24],
                "signals_forbidden": [
                    item for item in phase.get("signals_forbidden", []) if isinstance(item, str)
                ][:24],
                "note": phase.get("evidence_text") if isinstance(phase.get("evidence_text"), str) else None,
            }
            for phase in pattern_draft["phases"]
            if isinstance(phase, dict)
            and isinstance(phase.get("phase_id"), str)
            and isinstance(phase.get("label"), str)
        ]

    if payload.get("entry_spec") is None:
        trade_plan = pattern_draft.get("trade_plan")
        if isinstance(trade_plan, dict):
            entry_phase = trade_plan.get("entry_phase")
            if isinstance(entry_phase, str) and entry_phase:
                entry_trigger = trade_plan.get("entry_trigger")
                if isinstance(entry_trigger, list):
                    entry_trigger = ", ".join(
                        item for item in entry_trigger if isinstance(item, str) and item
                    ) or None
                payload["entry_spec"] = {
                    "entry_phase_id": entry_phase,
                    "entry_trigger": entry_trigger if isinstance(entry_trigger, str) and entry_trigger else None,
                    "stop_rule": trade_plan.get("stop_rule") if isinstance(trade_plan.get("stop_rule"), str) else None,
                    "target_rule": trade_plan.get("target_rule") if isinstance(trade_plan.get("target_rule"), str) else None,
                }

    return payload


@router.post("")
async def create_capture(
    request: Request,
    body: CaptureCreateBody,
    tier: TierInfo = Depends(tier_gate),
) -> dict:
    """Create a canonical capture record from Save Setup."""
    check_and_increment_quota(tier, "captures_per_day")
    # Extract user_id from JWT (injected by middleware)
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    if body.capture_kind != "pattern_candidate" and body.pattern_slug:
        try:
            body.pattern_slug = validate_pattern_slug(body.pattern_slug)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    transition_snapshot, transition_defaults = _validate_transition(body)
    record = CaptureRecord(
        capture_kind=body.capture_kind,
        user_id=user_id,
        symbol=body.symbol,
        pattern_slug=body.pattern_slug,
        pattern_version=body.pattern_version,
        phase=body.phase,
        timeframe=body.timeframe,
        captured_at_ms=now_ms(),
        candidate_transition_id=body.candidate_transition_id,
        candidate_id=body.candidate_id,
        scan_id=body.scan_id or transition_defaults.get("scan_id"),
        user_note=body.user_note,
        chart_context=body.chart_context,
        research_context=_normalize_research_context(body.research_context, default_timeframe=body.timeframe),
        feature_snapshot=body.feature_snapshot if body.feature_snapshot is not None else transition_snapshot,
        block_scores=body.block_scores or transition_defaults.get("block_scores", {}),
        status=_status_for_kind(body.capture_kind),
    )
    _capture_store.save(record)
    LEDGER_RECORD_STORE.append_capture_record(record)

    # Trigger wiki page update for this pattern (debounced, best-effort).
    if record.pattern_slug:
        try:
            from wiki.ingest import get_wiki_agent
            get_wiki_agent().on_capture_created(record.pattern_slug, record.id)
        except Exception:
            pass

    return {"ok": True, "capture": record.to_dict()}


class BulkImportRow(BaseModel):
    """One row in a founder bulk-import payload.

    Constraints are intentionally minimal to ease CSV translation — the
    resolver handles missing OHLCV gracefully by leaving the capture as
    pending_outcome for the next tick.
    """

    symbol: str
    timeframe: str = "1h"
    captured_at_ms: int = Field(..., description="Unix ms when the setup was observed")
    pattern_slug: str = ""
    phase: str = ""
    user_note: str | None = None
    research_context: ResearchContextBody | None = None
    entry_price: float | None = Field(
        default=None,
        description="Optional hint. Resolver derives entry_price from OHLCV regardless.",
    )


class BulkImportBody(BaseModel):
    rows: list[BulkImportRow] = Field(..., min_length=1, max_length=1000)


@router.post("/bulk_import")
async def bulk_import_captures(request: Request, body: BulkImportBody) -> dict:
    """Cold-start lane: ingest N founder hypotheses in one call.

    Every row becomes a ``manual_hypothesis`` CaptureRecord with
    ``status='pending_outcome'`` so outcome_resolver (scanner Job 3b)
    picks it up on the next window tick.
    """
    # Extract user_id from JWT (injected by middleware)
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="User authentication required")

    stored: list[CaptureRecord] = []
    for row in body.rows:
        try:
            row.pattern_slug = validate_pattern_slug(row.pattern_slug, allow_empty=True)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        chart_context: dict[str, Any] = {}
        if row.entry_price is not None:
            chart_context["hypothetical_entry_price"] = row.entry_price
        record = CaptureRecord(
            capture_kind="manual_hypothesis",
            user_id=user_id,
            symbol=row.symbol,
            pattern_slug=row.pattern_slug,
            pattern_version=1,
            phase=row.phase,
            timeframe=row.timeframe,
            captured_at_ms=row.captured_at_ms,
            user_note=row.user_note,
            chart_context=chart_context,
            research_context=_normalize_research_context(row.research_context, default_timeframe=row.timeframe),
            status="pending_outcome",
        )
        _capture_store.save(record)
        LEDGER_RECORD_STORE.append_capture_record(record)
        stored.append(record)
    return {
        "ok": True,
        "count": len(stored),
        "capture_ids": [r.capture_id for r in stored],
    }


# ── Verdict Inbox (Phase C — flywheel axis 3) ───────────────────────────────

def _join_outcome(capture: CaptureRecord) -> dict[str, Any]:
    """Return {capture, outcome} — outcome is None when the linked PatternOutcome
    cannot be loaded (e.g. pattern_slug mismatch, file deleted).

    Kept private so the list/verdict endpoints share one join shape.
    """
    outcome = None
    if capture.outcome_id and capture.pattern_slug:
        loaded = _ledger_store.load(capture.pattern_slug, capture.outcome_id)
        if loaded is not None:
            outcome = loaded.to_dict()
    return {"capture": capture.to_dict(), "outcome": outcome}


@router.get("/outcomes")
async def list_verdict_inbox(
    user_id: str | None = None,
    pattern_slug: str | None = None,
    symbol: str | None = None,
    status: Literal["outcome_ready", "verdict_ready"] = "outcome_ready",
    limit: int = Query(default=100, ge=1, le=500),
) -> dict:
    """Verdict Inbox — resolved captures awaiting user verdict.

    Defaults to ``status='outcome_ready'`` (needs review). Pass
    ``status='verdict_ready'`` to inspect previously labelled items.
    """
    captures = _capture_store.list(
        user_id=user_id,
        pattern_slug=pattern_slug,
        symbol=symbol,
        status=status,
        limit=limit,
    )
    rows = [_join_outcome(c) for c in captures]
    return {"ok": True, "status": status, "count": len(rows), "items": rows}


class _VerdictBody(BaseModel):
    verdict: VerdictLabel
    user_note: str | None = None


@router.post("/{capture_id}/verdict")
async def set_capture_verdict(capture_id: str, body: _VerdictBody) -> dict:
    """Apply user verdict to a resolved capture.

    Requires status in {'outcome_ready', 'verdict_ready'} — the capture must
    have a linked PatternOutcome. The verdict is written to the outcome
    record, appended to LEDGER:verdict, and the capture is flipped to
    ``status='verdict_ready'`` so it leaves the inbox.
    """
    capture = _capture_store.load(capture_id)
    if capture is None:
        raise HTTPException(status_code=404, detail=f"Capture not found: {capture_id}")
    if capture.status not in ("outcome_ready", "verdict_ready"):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Capture {capture_id} is in status={capture.status!r}; "
                "only outcome_ready/verdict_ready captures accept a verdict."
            ),
        )
    if not capture.outcome_id or not capture.pattern_slug:
        raise HTTPException(
            status_code=409,
            detail=f"Capture {capture_id} has no linked outcome — cannot verdict.",
        )

    outcome = _ledger_store.load(capture.pattern_slug, capture.outcome_id)
    if outcome is None:
        raise HTTPException(
            status_code=404,
            detail=f"Linked outcome {capture.outcome_id} missing for capture {capture_id}",
        )

    if outcome.definition_id is None and capture.definition_id is not None:
        outcome.pattern_version = outcome.pattern_version or capture.pattern_version
        outcome.definition_id = capture.definition_id
        outcome.definition_ref = dict(capture.definition_ref or {})

    outcome.user_verdict = body.verdict  # type: ignore[assignment]
    if body.user_note is not None:
        outcome.user_note = body.user_note
    _ledger_store.save(outcome)
    LEDGER_RECORD_STORE.append_verdict_record(outcome)
    _capture_store.update_status(
        capture_id,
        "verdict_ready",
        verdict_id=outcome.id,
    )

    # Invalidate stats cache so next request reflects this verdict immediately.
    try:
        from stats.engine import get_stats_engine
        get_stats_engine().invalidate()
    except Exception:
        pass  # stats cache is best-effort

    # Trigger wiki page update for this pattern (debounced, best-effort).
    try:
        from wiki.ingest import get_wiki_agent
        get_wiki_agent().on_verdict_submitted(capture.pattern_slug, outcome.id)
    except Exception:
        pass

    return {
        "ok": True,
        "capture_id": capture_id,
        "outcome_id": outcome.id,
        "user_verdict": outcome.user_verdict,
        "status": "verdict_ready",
    }


# ── Chart annotations (TradingView overlay feed) ────────────────────────────
# NOTE: must be registered BEFORE /{capture_id} to avoid route collision.


class CaptureBenchmarkSearchBody(BaseModel):
    candidate_timeframes: list[str] | None = Field(default=None, max_length=6)
    warmup_bars: int = Field(default=240, ge=24, le=5000)
    min_reference_score: float = Field(default=0.55, ge=0.0, le=1.0)
    min_holdout_score: float = Field(default=0.35, ge=0.0, le=1.0)


def _dedupe_timeframes(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None
    deduped: list[str] = []
    for value in values:
        if value and value not in deduped:
            deduped.append(value)
    return deduped or None


def _build_and_save_capture_benchmark_pack(
    capture: CaptureRecord,
    *,
    candidate_timeframes: list[str] | None = None,
):
    pack = build_manual_hypothesis_benchmark_pack_draft(capture)
    normalized_timeframes = _dedupe_timeframes(candidate_timeframes)
    if normalized_timeframes is not None:
        pack = replace(pack, candidate_timeframes=normalized_timeframes)
    saved_path = _benchmark_pack_store.save(pack)
    return pack, saved_path


def _build_capture_search_query_spec(capture: CaptureRecord) -> dict[str, Any] | None:
    research_context = capture.research_context or {}
    pattern_draft = research_context.get("pattern_draft")
    if not isinstance(pattern_draft, dict):
        return None
    try:
        return transform_pattern_draft(pattern_draft).to_dict()
    except ValueError as exc:
        log.warning(
            "capture benchmark_search skipped invalid pattern_draft search_query_spec "
            "capture_id=%s reason=%s",
            capture.capture_id,
            exc,
        )
        return None

@router.post("/{capture_id}/benchmark_pack_draft")
async def create_capture_benchmark_pack_draft(
    capture_id: str,
    body: CaptureBenchmarkSearchBody | None = None,
) -> dict:
    capture = _capture_store.load(capture_id)
    if capture is None:
        raise HTTPException(status_code=404, detail=f"Capture not found: {capture_id}")
    try:
        pack, saved_path = await asyncio.to_thread(
            _build_and_save_capture_benchmark_pack,
            capture,
            candidate_timeframes=body.candidate_timeframes if body is not None else None,
        )
    except ManualHypothesisBenchmarkPackError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "ok": True,
        "source_capture_id": capture_id,
        "benchmark_pack": pack.to_dict(),
        "saved_path": str(saved_path),
    }


@router.post("/{capture_id}/benchmark_search")
async def create_capture_benchmark_search(
    capture_id: str,
    body: CaptureBenchmarkSearchBody | None = None,
) -> dict:
    capture = _capture_store.load(capture_id)
    if capture is None:
        raise HTTPException(status_code=404, detail=f"Capture not found: {capture_id}")
    try:
        pack, saved_path = await asyncio.to_thread(
            _build_and_save_capture_benchmark_pack,
            capture,
            candidate_timeframes=body.candidate_timeframes if body is not None else None,
        )
    except ManualHypothesisBenchmarkPackError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    config = PatternBenchmarkSearchConfig(
        pattern_slug=pack.pattern_slug,
        benchmark_pack_id=pack.benchmark_pack_id,
        search_query_spec=_build_capture_search_query_spec(capture),
        warmup_bars=body.warmup_bars if body is not None else 240,
        min_reference_score=body.min_reference_score if body is not None else 0.55,
        min_holdout_score=body.min_holdout_score if body is not None else 0.35,
    )
    run = await asyncio.to_thread(
        run_pattern_benchmark_search,
        config,
        pack_store=_benchmark_pack_store,
        artifact_store=_pattern_search_artifact_store,
        active_variant_store=ACTIVE_PATTERN_VARIANT_STORE,
    )
    artifact = await asyncio.to_thread(_pattern_search_artifact_store.load, run.research_run_id)
    return {
        "ok": True,
        "source_capture_id": capture_id,
        "benchmark_pack": pack.to_dict(),
        "saved_path": str(saved_path),
        "research_run": asdict(run),
        "artifact": artifact,
    }

@router.get("/chart-annotations")
async def get_chart_annotations(
    user_id: str | None = None,
    symbol: str = Query(..., description="e.g. BTCUSDT"),
    timeframe: str = Query("1h"),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict:
    """Return capture markers formatted for TradingView chart overlay.

    Poll at ~60s intervals. Each annotation includes price levels from
    chart_context so the frontend can render entry/stop/tp lines.

    Response shape (one entry per capture):
      capture_id      — unique ID
      kind            — capture_kind
      status          — pending_outcome | outcome_ready | verdict_ready | closed
      pattern_slug    — e.g. "tradoor-oi-reversal-v1"
      phase           — e.g. "SPRING"
      captured_at_s   — unix seconds (chart x-axis anchor)
      entry_price     — from chart_context.entry_price (null if not set)
      stop_price      — from chart_context.stop (null if not set)
      tp1_price       — from chart_context.tp1 (null if not set)
      tp2_price       — from chart_context.tp2 (null if not set)
      eval_window_ms  — evaluation window in ms (for shading end x)
      p_win           — float 0–1 if recorded
      user_verdict    — "valid" | "invalid" | "near_miss" | "too_early" | "too_late" | null
    """
    captures = await asyncio.to_thread(
        _capture_store.list,
        user_id=user_id,
        symbol=symbol,
        limit=limit,
    )
    # Filter to matching timeframe
    captures = [c for c in captures if c.timeframe == timeframe]

    annotations = []
    for c in captures:
        ctx = c.chart_context or {}
        annotation: dict[str, Any] = {
            "capture_id": c.capture_id,
            "kind": c.capture_kind,
            "status": c.status,
            "pattern_slug": c.pattern_slug,
            "phase": c.phase,
            "captured_at_s": c.captured_at_ms // 1000,
            "entry_price": ctx.get("entry_price"),
            "stop_price": ctx.get("stop"),
            "tp1_price": ctx.get("tp1"),
            "tp2_price": ctx.get("tp2"),
            "eval_window_ms": ctx.get("eval_window_ms"),
            "p_win": ctx.get("p_win"),
            "user_verdict": None,
        }
        # Attach verdict if outcome is linked
        if c.outcome_id and c.pattern_slug:
            outcome = _ledger_store.load(c.pattern_slug, c.outcome_id)
            if outcome is not None:
                annotation["user_verdict"] = getattr(outcome, "user_verdict", None)
        annotations.append(annotation)

    return {
        "ok": True,
        "symbol": symbol,
        "timeframe": timeframe,
        "count": len(annotations),
        "annotations": annotations,
    }


# ── Single + list (MUST be after /chart-annotations to avoid collision) ──────

@router.post("/{capture_id}/watch")
async def watch_capture(capture_id: str) -> dict:
    """Mark a capture as watching. Idempotent — calling twice is safe."""
    found = _capture_store.set_watching(capture_id, True)
    if not found:
        raise HTTPException(status_code=404, detail=f"Capture not found: {capture_id}")
    return {"ok": True, "status": "watching", "capture_id": capture_id}


@router.post("/{capture_id}/verdict-link")
async def create_verdict_deeplink(capture_id: str, request: Request) -> dict:
    """F-3: Generate a signed 72h deep-link token for Telegram verdict submission.

    Token = HMAC-SHA256 signed payload (stateless, no DB write).
    The app /verdict?token=xxx validates and pre-fills the VerdictModal.
    """
    import os

    secret = os.environ.get("VERDICT_LINK_SECRET", "")
    if not secret:
        raise HTTPException(status_code=503, detail="VERDICT_LINK_SECRET not configured")

    capture = _capture_store.load(capture_id)
    if not capture:
        raise HTTPException(status_code=404, detail=f"Capture not found: {capture_id}")

    token = sign_verdict_token(capture_id, capture.symbol, capture.pattern_slug)
    if not token:
        raise HTTPException(status_code=503, detail="VERDICT_LINK_SECRET not configured")

    url = verdict_deeplink_url(token)
    return {
        "ok": True,
        "token": token,
        "url": url,
        "capture_id": capture_id,
    }


@router.get("/{capture_id}")
async def get_capture(capture_id: str) -> dict:
    capture = _capture_store.load(capture_id)
    if capture is None:
        raise HTTPException(status_code=404, detail=f"Capture not found: {capture_id}")
    return {"ok": True, "capture": capture.to_dict()}


@router.get("")
async def list_captures(
    user_id: str | None = None,
    pattern_slug: str | None = None,
    symbol: str | None = None,
    status: str | None = None,
    watching: bool | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> dict:
    captures = _capture_store.list(
        user_id=user_id,
        pattern_slug=pattern_slug,
        symbol=symbol,
        status=status,
        is_watching=watching,
        limit=limit,
    )
    return {
        "ok": True,
        "captures": [capture.to_dict() for capture in captures],
        "count": len(captures),
    }


# ── Auto-capture job (called by /jobs/auto_capture/run) ──────────────────────

_PRIORITY_SLUGS = [
    "funding-flip-reversal-v1",
    "radar-golden-entry-v1",
    "tradoor-oi-reversal-v1",
    "wyckoff-spring-reversal-v1",
    "liquidity-sweep-reversal-v1",
    "whale-accumulation-reversal-v1",
    "var-volume-absorption-reversal-v1",
    "wsr-wyckoff-spring-reversal-v1",
]
_DEDUP_WINDOW_SECONDS = 86400  # 24h


def _get_recent_keys() -> set[str]:
    """Return symbol+slug keys captured in the last 24h."""
    cutoff_ms = (int(time.time()) - _DEDUP_WINDOW_SECONDS) * 1000
    captures = _capture_store.list(limit=500)
    return {
        f"{c.symbol}:{c.pattern_slug}"
        for c in captures
        if c.captured_at_ms >= cutoff_ms
    }


async def _auto_capture_job() -> None:
    """Auto-capture current pattern candidates (for Cloud Scheduler)."""
    from api.routes.patterns_thread import get_all_candidates_sync  # type: ignore[import]

    candidates_data = await asyncio.to_thread(get_all_candidates_sync)
    candidates: list[dict[str, Any]] = candidates_data.get("candidates", [])

    if not candidates:
        log.info("auto_capture: no candidates found")
        return

    # Sort by priority order
    slug_rank = {slug: i for i, slug in enumerate(_PRIORITY_SLUGS)}
    candidates.sort(key=lambda c: slug_rank.get(c.get("pattern_slug", ""), 999))

    recent_keys = await asyncio.to_thread(_get_recent_keys)

    stored = 0
    skipped_dedup = 0
    for cand in candidates[:20]:  # max 20 per run
        symbol = cand.get("symbol", "")
        slug = cand.get("pattern_slug", "")
        key = f"{symbol}:{slug}"

        if key in recent_keys:
            skipped_dedup += 1
            continue

        record = CaptureRecord(
            capture_kind="pattern_candidate",
            user_id="auto",
            symbol=symbol,
            pattern_slug=slug,
            pattern_version=cand.get("pattern_version", 1),
            phase=cand.get("current_phase", ""),
            timeframe=cand.get("timeframe", "1h"),
            captured_at_ms=now_ms(),
            chart_context={"auto_capture": True, "p_win": cand.get("p_win")},
            block_scores=cand.get("block_scores", {}),
            status="pending_outcome",
        )
        _capture_store.save(record)
        LEDGER_RECORD_STORE.append_capture_record(record)
        recent_keys.add(key)
        stored += 1

    log.info(
        "auto_capture done: stored=%d skipped_dedup=%d total_candidates=%d",
        stored, skipped_dedup, len(candidates),
    )
