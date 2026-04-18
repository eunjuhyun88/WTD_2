"""Capture endpoints — canonical Save Setup records.

Routes:
  POST /captures             single capture (pattern_candidate, manual_hypothesis, ...)
  POST /captures/bulk_import founder cold-start: bulk-ingest manual hypothesis setups
  GET  /captures/{id}
  GET  /captures

Cold-start lane (design: docs/product/flywheel-closure-design.md):
  - manual_hypothesis captures enter with status='pending_outcome' so the
    outcome_resolver closes them via the same pipeline as pattern_candidate.
  - Bulk import is the founder's seed lane before external users arrive.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from capture.store import CaptureStore, now_ms
from capture.types import CaptureKind, CaptureRecord
from ledger.store import LEDGER_RECORD_STORE
from patterns.state_store import PatternStateStore

router = APIRouter()
_capture_store = CaptureStore()
_state_store = PatternStateStore()


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
    limit: int = Query(default=100, ge=1, le=500),
) -> dict:
    captures = _capture_store.list(
        user_id=user_id,
        pattern_slug=pattern_slug,
        symbol=symbol,
        limit=limit,
    )
    return {
        "ok": True,
        "captures": [capture.to_dict() for capture in captures],
        "count": len(captures),
    }
