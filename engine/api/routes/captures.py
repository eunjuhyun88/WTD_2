"""Capture endpoints — canonical Save Setup records."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from capture.store import CaptureStore, now_ms
from capture.types import CaptureKind, CaptureRecord
from patterns.state_store import PatternStateStore

router = APIRouter()
_capture_store = CaptureStore()
_state_store = PatternStateStore()


class CaptureCreateBody(BaseModel):
    capture_kind: CaptureKind = "pattern_candidate"
    user_id: str | None = None
    symbol: str
    pattern_slug: str
    pattern_version: int = 1
    phase: str
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
        status="pending_outcome" if body.capture_kind == "pattern_candidate" else "closed",
    )
    _capture_store.save(record)
    return {"ok": True, "capture": record.to_dict()}


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
