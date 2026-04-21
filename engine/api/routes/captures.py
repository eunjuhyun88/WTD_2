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
    annotates them as valid/invalid/missed so axis 4 (refinement) can train.

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
import logging
import time
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

log = logging.getLogger("engine.captures")

from capture.store import CaptureStore, now_ms
from capture.types import CaptureKind, CaptureRecord
from ledger.store import LEDGER_RECORD_STORE, LedgerStore
from patterns.state_store import PatternStateStore

log = logging.getLogger("engine.captures")

router = APIRouter()
_capture_store = CaptureStore()
_state_store = PatternStateStore()
_ledger_store = LedgerStore()

# Literal alias documents the accepted values and lets pydantic validate.
VerdictLabel = Literal["valid", "invalid", "missed"]


def _status_for_kind(kind: CaptureKind) -> str:
    """Lifecycle status assigned at ingest time.

    pattern_candidate and manual_hypothesis enter the resolver pipeline.
    chart_bookmark and post_trade_review are terminal on write (no
    outcome to compute).
    """
    if kind in ("pattern_candidate", "manual_hypothesis"):
        return "pending_outcome"
    return "closed"


class CaptureCreateBody(BaseModel):
    capture_kind: CaptureKind = "pattern_candidate"
    user_id: str | None = None
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
    feature_snapshot: dict[str, Any] | None = None
    block_scores: dict[str, Any] = Field(default_factory=dict)


def _validate_transition(body: CaptureCreateBody) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    if body.capture_kind != "pattern_candidate":
        return None, {}
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


@router.post("")
async def create_capture(body: CaptureCreateBody) -> dict:
    """Create a canonical capture record from Save Setup."""
    transition_snapshot, transition_defaults = _validate_transition(body)
    record = CaptureRecord(
        capture_kind=body.capture_kind,
        user_id=body.user_id,
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
        feature_snapshot=body.feature_snapshot if body.feature_snapshot is not None else transition_snapshot,
        block_scores=body.block_scores or transition_defaults.get("block_scores", {}),
        status=_status_for_kind(body.capture_kind),
    )
    _capture_store.save(record)
    LEDGER_RECORD_STORE.append_capture_record(record)
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
    entry_price: float | None = Field(
        default=None,
        description="Optional hint. Resolver derives entry_price from OHLCV regardless.",
    )


class BulkImportBody(BaseModel):
    user_id: str
    rows: list[BulkImportRow] = Field(..., min_length=1, max_length=1000)


@router.post("/bulk_import")
async def bulk_import_captures(body: BulkImportBody) -> dict:
    """Cold-start lane: ingest N founder hypotheses in one call.

    Every row becomes a ``manual_hypothesis`` CaptureRecord with
    ``status='pending_outcome'`` so outcome_resolver (scanner Job 3b)
    picks it up on the next window tick.
    """
    stored: list[CaptureRecord] = []
    for row in body.rows:
        chart_context: dict[str, Any] = {}
        if row.entry_price is not None:
            chart_context["hypothetical_entry_price"] = row.entry_price
        record = CaptureRecord(
            capture_kind="manual_hypothesis",
            user_id=body.user_id,
            symbol=row.symbol,
            pattern_slug=row.pattern_slug,
            pattern_version=1,
            phase=row.phase,
            timeframe=row.timeframe,
            captured_at_ms=row.captured_at_ms,
            user_note=row.user_note,
            chart_context=chart_context,
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

    return {
        "ok": True,
        "capture_id": capture_id,
        "outcome_id": outcome.id,
        "user_verdict": outcome.user_verdict,
        "status": "verdict_ready",
    }


# ── Chart annotations (TradingView overlay feed) ────────────────────────────
# NOTE: must be registered BEFORE /{capture_id} to avoid path collision

@router.get("/chart-annotations")
async def get_chart_annotations(
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
      user_verdict    — "valid" | "invalid" | "missed" | null
    """
    captures = await asyncio.to_thread(
        _capture_store.list,
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
    limit: int = Query(default=100, ge=1, le=500),
) -> dict:
    captures = _capture_store.list(
        user_id=user_id,
        pattern_slug=pattern_slug,
        symbol=symbol,
        status=status,
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
