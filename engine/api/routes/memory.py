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
from memory.state_store import MemoryStateStore
from memory.rerank import rerank_candidates

router = APIRouter()
_memory_state_store: MemoryStateStore | None = None


def get_memory_state_store() -> MemoryStateStore:
    global _memory_state_store
    if _memory_state_store is None:
        _memory_state_store = MemoryStateStore()
    return _memory_state_store


def _set_memory_state_store_for_tests(store: MemoryStateStore) -> None:
    global _memory_state_store
    _memory_state_store = store


def _apply_feedback(payload: MemoryFeedbackRequest) -> MemoryFeedbackResponse:
    updated_at = datetime.now(timezone.utc).isoformat()
    current = get_memory_state_store().apply_feedback(payload, updated_at)
    return MemoryFeedbackResponse(
        memory_id=payload.memory_id,
        access_count=current,
        updated_at=updated_at,
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
    rejected_indexed = get_memory_state_store().record_debug_session(payload, now)
    return MemoryDebugSessionResponse(
        session_id=payload.session_id,
        rejected_indexed=rejected_indexed,
        updated_at=now,
    )


@router.post("/rejected/search", response_model=MemoryRejectedLookupResponse)
def memory_rejected_search(payload: MemoryRejectedLookupRequest) -> MemoryRejectedLookupResponse:
    return MemoryRejectedLookupResponse(records=get_memory_state_store().search_rejected(payload))
