from __future__ import annotations

import pytest

from api.schemas import (
    MemoryDebugSessionRequest,
    MemoryFeedbackRequest,
    MemoryQueryRequest,
    MemoryQueryResponse,
    MemoryRejectedLookupRequest,
)
from api.routes.memory import (
    _set_memory_state_store_for_tests,
    memory_debug_session,
    memory_feedback,
    memory_query,
    memory_rejected_search,
)
from memory.state_store import MemoryStateStore


@pytest.fixture(autouse=True)
def isolated_memory_state_store(tmp_path) -> None:
    _set_memory_state_store_for_tests(MemoryStateStore(tmp_path / "memory_runtime.sqlite"))


def test_memory_query_request_accepts_contract_payload() -> None:
    payload = {
        "query": "btc invalidation",
        "context": {"symbol": "BTCUSDT", "timeframe": "1h", "intent": "risk_review", "mode": "terminal"},
        "top_k": 2,
        "candidates": [
            {
                "id": "m1",
                "kind": "fact",
                "text": "BTC 1h invalidation below 63k",
                "base_score": 0.8,
                "confidence": "verified",
                "access_count": 4,
                "tags": ["btcusdt", "1h", "risk_review"],
            },
            {
                "id": "m2",
                "kind": "fact",
                "text": "Altseason note",
                "base_score": 1.1,
                "confidence": "observed",
                "access_count": 1,
                "tags": ["macro"],
            },
        ],
    }
    req = MemoryQueryRequest.model_validate(payload)
    assert req.context.symbol == "BTCUSDT"
    assert req.top_k == 2


def test_memory_query_response_roundtrip() -> None:
    req = MemoryQueryRequest.model_validate(
        {
            "query": "btc invalidation",
            "context": {"symbol": "BTCUSDT", "timeframe": "1h", "intent": "risk_review"},
            "top_k": 1,
            "candidates": [
                {
                    "id": "m1",
                    "kind": "fact",
                    "text": "BTC 1h invalidation below 63k",
                    "base_score": 0.8,
                    "confidence": "verified",
                    "access_count": 4,
                    "tags": ["btcusdt", "1h", "risk_review"],
                }
            ],
        }
    )
    response = memory_query(req)
    validated = MemoryQueryResponse.model_validate(response.model_dump())

    assert validated.ok is True
    assert validated.records[0].id == "m1"
    assert validated.debug.rerank_applied is True


def test_memory_feedback_roundtrip_increments_access_count() -> None:
    req = MemoryFeedbackRequest.model_validate(
        {
            "query_id": "mq-test",
            "memory_id": "m1",
            "event": "retrieved",
            "context": {"symbol": "BTCUSDT", "timeframe": "1h", "intent": "summary"},
            "occurred_at": "2026-04-15T10:00:00+00:00",
        }
    )
    response = memory_feedback(req)
    assert response.ok is True
    assert response.memory_id == "m1"
    assert response.access_count >= 1


def test_memory_debug_session_indexes_rejected_hypothesis() -> None:
    req = MemoryDebugSessionRequest.model_validate(
        {
            "session_id": "dbg-1",
            "context": {"symbol": "BTCUSDT", "intent": "risk_review"},
            "hypotheses": [
                {
                    "id": "h-1",
                    "text": "Funding spike caused this move",
                    "status": "rejected",
                    "evidence": ["funding normalized"],
                    "rejection_reason": "No follow-through in liquidation clusters",
                }
            ],
            "started_at": "2026-04-15T10:00:00+00:00",
            "ended_at": "2026-04-15T10:05:00+00:00",
        }
    )
    response = memory_debug_session(req)
    assert response.ok is True
    assert response.rejected_indexed == 1

    lookup = memory_rejected_search(
        MemoryRejectedLookupRequest.model_validate(
            {"symbol": "BTCUSDT", "intent": "risk_review", "query": "liquidation", "limit": 5}
        )
    )
    assert lookup.ok is True
    assert len(lookup.records) >= 1
    assert lookup.records[0].id == "h-1"
