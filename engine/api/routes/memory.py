"""Memory API routes for context rerank + feedback loop."""
from __future__ import annotations

import time
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter

from api.schemas_memory import (
    MemoryDebugSessionRequest,
    MemoryDebugSessionResponse,
    MemoryFeedbackBatchItem,
    MemoryFeedbackBatchRequest,
    MemoryFeedbackBatchResponse,
    MemoryFeedbackRequest,
    MemoryFeedbackResponse,
    MemoryRejectedLookupRequest,
    MemoryRejectedLookupResponse,
    MemoryRejectedRecord,
    MemoryQueryDebug,
    MemoryQueryRequest,
    MemoryQueryResponse,
    MemoryRankedRecord,
)
from memory.rerank import rerank_candidates

router = APIRouter()
_feedback_access_counts: dict[str, int] = {}
_rejected_index: dict[str, MemoryRejectedRecord] = {}


def _apply_feedback(payload: MemoryFeedbackRequest) -> MemoryFeedbackResponse:
    current = _feedback_access_counts.get(payload.memory_id, 0)
    if payload.event in {"retrieved", "used", "confirmed"}:
        current += 1
    _feedback_access_counts[payload.memory_id] = current
    return MemoryFeedbackResponse(
        memory_id=payload.memory_id,
        access_count=current,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/query", response_model=MemoryQueryResponse)
def memory_query(payload: MemoryQueryRequest) -> MemoryQueryResponse:
    started = time.perf_counter()
    ranked = rerank_candidates(payload.candidates, payload.context, top_k=payload.top_k)
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    records = [
        MemoryRankedRecord(
            id=candidate.id,
            kind=candidate.kind,
            text=candidate.text,
            score=score,
            base_score=candidate.base_score,
            confidence=candidate.confidence,
            access_count=candidate.access_count,
            tags=candidate.tags,
            reasons=reasons,
        )
        for candidate, score, reasons in ranked
    ]
    return MemoryQueryResponse(
        query_id=f"mq-{uuid4()}",
        records=records,
        debug=MemoryQueryDebug(
            rerank_applied=True,
            base_result_count=len(payload.candidates),
            elapsed_ms=max(elapsed_ms, 0),
        ),
    )


@router.post("/feedback", response_model=MemoryFeedbackResponse)
def memory_feedback(payload: MemoryFeedbackRequest) -> MemoryFeedbackResponse:
    return _apply_feedback(payload)


@router.post("/feedback/batch", response_model=MemoryFeedbackBatchResponse)
def memory_feedback_batch(payload: MemoryFeedbackBatchRequest) -> MemoryFeedbackBatchResponse:
    responses = [_apply_feedback(item) for item in payload.items]
    return MemoryFeedbackBatchResponse(
        processed=len(responses),
        items=[
            MemoryFeedbackBatchItem(
                memory_id=response.memory_id,
                access_count=response.access_count,
                updated_at=response.updated_at,
            )
            for response in responses
        ],
    )


@router.post("/debug-session", response_model=MemoryDebugSessionResponse)
def memory_debug_session(payload: MemoryDebugSessionRequest) -> MemoryDebugSessionResponse:
    now = datetime.now(timezone.utc).isoformat()
    rejected_indexed = 0
    for hypothesis in payload.hypotheses:
        if hypothesis.status != "rejected":
            continue
        key = f"{payload.session_id}:{hypothesis.id}"
        _rejected_index[key] = MemoryRejectedRecord(
            id=hypothesis.id,
            session_id=payload.session_id,
            text=hypothesis.text,
            rejection_reason=hypothesis.rejection_reason,
            symbol=payload.context.symbol,
            intent=payload.context.intent,
            updated_at=now,
        )
        rejected_indexed += 1
    return MemoryDebugSessionResponse(
        session_id=payload.session_id,
        rejected_indexed=rejected_indexed,
        updated_at=now,
    )


@router.post("/rejected/search", response_model=MemoryRejectedLookupResponse)
def memory_rejected_search(payload: MemoryRejectedLookupRequest) -> MemoryRejectedLookupResponse:
    symbol = payload.symbol.lower() if payload.symbol else None
    intent = payload.intent.lower() if payload.intent else None
    query = payload.query.lower() if payload.query else None

    records = list(_rejected_index.values())
    filtered: list[MemoryRejectedRecord] = []
    for record in records:
        if symbol and (record.symbol or "").lower() != symbol:
            continue
        if intent and (record.intent or "").lower() != intent:
            continue
        if query:
            text_blob = f"{record.text} {record.rejection_reason or ''}".lower()
            if query not in text_blob:
                continue
        filtered.append(record)
    return MemoryRejectedLookupResponse(records=filtered[: payload.limit])
