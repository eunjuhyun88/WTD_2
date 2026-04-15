from __future__ import annotations

from api.schemas_memory import MemoryDebugSessionRequest, MemoryFeedbackRequest, MemoryRejectedLookupRequest
from memory.state_store import MemoryStateStore


def test_memory_state_store_persists_feedback_and_rejected_search(tmp_path) -> None:
    db_path = tmp_path / "memory_runtime.sqlite"
    store = MemoryStateStore(db_path)

    feedback = MemoryFeedbackRequest.model_validate(
        {
            "query_id": "mq-test",
            "memory_id": "m1",
            "event": "retrieved",
            "context": {"symbol": "BTCUSDT", "timeframe": "1h", "intent": "summary"},
            "occurred_at": "2026-04-15T10:00:00+00:00",
        }
    )
    assert store.apply_feedback(feedback, "2026-04-15T10:00:01+00:00") == 1

    session = MemoryDebugSessionRequest.model_validate(
        {
            "session_id": "dbg-1",
            "context": {"symbol": "BTCUSDT", "timeframe": "1h", "intent": "risk_review"},
            "hypotheses": [
                {
                    "id": "h-1",
                    "text": "Funding spike caused the move",
                    "status": "rejected",
                    "evidence": ["funding normalized"],
                    "rejection_reason": "No follow-through in liquidation clusters",
                }
            ],
            "started_at": "2026-04-15T10:00:00+00:00",
            "ended_at": "2026-04-15T10:05:00+00:00",
        }
    )
    assert store.record_debug_session(session, "2026-04-15T10:05:00+00:00") == 1

    reloaded = MemoryStateStore(db_path)
    lookup = reloaded.search_rejected(
        MemoryRejectedLookupRequest.model_validate(
            {"symbol": "BTCUSDT", "intent": "risk_review", "query": "liquidation", "limit": 5}
        )
    )
    assert len(lookup) == 1
    assert lookup[0].id == "h-1"
