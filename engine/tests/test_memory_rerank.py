from __future__ import annotations

from api.schemas_memory import MemoryCandidate, MemoryContext
from memory.rerank import rerank_candidates


def test_rerank_prefers_context_tag_matches() -> None:
    context = MemoryContext(symbol="BTCUSDT", timeframe="1h", intent="risk_review", mode="terminal")
    candidates = [
        MemoryCandidate(
            id="a",
            kind="fact",
            text="General market note",
            base_score=1.2,
            confidence="verified",
            tags=["macro"],
            access_count=1,
        ),
        MemoryCandidate(
            id="b",
            kind="fact",
            text="BTC 1h invalidation guidance",
            base_score=1.0,
            confidence="observed",
            tags=["btcusdt", "1h", "risk_review", "terminal"],
            access_count=3,
        ),
    ]

    ranked = rerank_candidates(candidates, context, top_k=2)
    assert ranked[0][0].id == "b"
    assert "symbol" in ranked[0][2]
    assert "intent" in ranked[0][2]


def test_rerank_applies_confidence_penalty_for_hypothesis() -> None:
    context = MemoryContext()
    candidates = [
        MemoryCandidate(id="v", kind="fact", text="Verified memory", base_score=0.1, confidence="verified"),
        MemoryCandidate(id="h", kind="fact", text="Hypothesis memory", base_score=0.3, confidence="hypothesis"),
    ]

    ranked = rerank_candidates(candidates, context, top_k=2)
    assert ranked[0][0].id == "v"

