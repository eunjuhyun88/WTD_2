"""Deterministic context-aware memory reranker (Phase 1 MVP)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from api.schemas_memory import MemoryCandidate, MemoryContext

if TYPE_CHECKING:
    from memory.state_store import UserVerdictWeightStore


@dataclass(frozen=True)
class RerankWeights:
    symbol_match: float = 0.8
    timeframe_match: float = 0.5
    mode_match: float = 0.4
    intent_match: float = 0.7
    confidence_verified: float = 0.4
    confidence_observed: float = 0.15
    confidence_hypothesis: float = -0.2
    access_log_boost: float = 0.1
    top_access_cap: int = 20


def _confidence_boost(confidence: str, weights: RerankWeights) -> float:
    if confidence == "verified":
        return weights.confidence_verified
    if confidence == "observed":
        return weights.confidence_observed
    return weights.confidence_hypothesis


def score_candidate(candidate: MemoryCandidate, context: MemoryContext, weights: RerankWeights | None = None) -> tuple[float, list[str]]:
    w = weights or RerankWeights()
    score = float(candidate.base_score)
    reasons: list[str] = []

    symbol = context.symbol.lower() if context.symbol else None
    timeframe = context.timeframe.lower() if context.timeframe else None
    mode = context.mode.lower() if context.mode else None
    intent = context.intent.lower() if context.intent else None
    tags_lower = {tag.lower() for tag in candidate.tags}

    if symbol and symbol in tags_lower:
        score += w.symbol_match
        reasons.append("symbol")
    if timeframe and timeframe in tags_lower:
        score += w.timeframe_match
        reasons.append("timeframe")
    if mode and mode in tags_lower:
        score += w.mode_match
        reasons.append("mode")
    if intent and intent in tags_lower:
        score += w.intent_match
        reasons.append("intent")

    conf = _confidence_boost(candidate.confidence, w)
    if conf != 0:
        score += conf
        reasons.append(f"confidence:{candidate.confidence}")

    normalized_access = min(max(candidate.access_count, 0), w.top_access_cap) / max(w.top_access_cap, 1)
    if normalized_access > 0:
        score += normalized_access * w.access_log_boost
        reasons.append("usage")

    return score, reasons


def rerank_candidates(
    candidates: list[MemoryCandidate],
    context: MemoryContext,
    top_k: int = 8,
    weights: RerankWeights | None = None,
) -> list[tuple[MemoryCandidate, float, list[str]]]:
    scored = []
    for candidate in candidates:
        score, reasons = score_candidate(candidate, context, weights)
        scored.append((candidate, score, reasons))

    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[: max(top_k, 1)]


# ---------------------------------------------------------------------------
# Verdict feedback API — W-0346
# ---------------------------------------------------------------------------

def context_tags_from_outcome(
    *,
    symbol: str | None = None,
    timeframe: str | None = None,
    pattern_slug: str | None = None,
) -> list[str]:
    """Build context tags for a verdict outcome."""
    tags: list[str] = []
    if symbol:
        tags.append(f"symbol:{symbol.upper()}")
    if timeframe:
        tags.append(f"timeframe:{timeframe.lower()}")
    if pattern_slug:
        tags.append(f"pattern:{pattern_slug.lower()}")
    return tags


def apply_verdict_feedback(
    user_id: str,
    verdict: str,
    *,
    symbol: str | None = None,
    timeframe: str | None = None,
    pattern_slug: str | None = None,
    weight_store: "UserVerdictWeightStore | None" = None,
) -> None:
    """Apply verdict feedback to per-user reranker weights (fire-and-forget).

    verdict ∈ {valid, invalid, near_miss, too_early, too_late}
    Deltas: valid=+0.05, near_miss/too_early/too_late=+0.01/+0.02, invalid=−0.08
    Cap: ±1.0 per context_tag. Cold start (n<5): no-op.
    """
    from memory.state_store import USER_VERDICT_WEIGHT_STORE
    store = weight_store or USER_VERDICT_WEIGHT_STORE
    tags = context_tags_from_outcome(symbol=symbol, timeframe=timeframe, pattern_slug=pattern_slug)
    if tags:
        store.apply(user_id, tags, verdict)


def score_candidate_with_user_feedback(
    candidate: MemoryCandidate,
    context: MemoryContext,
    user_id: str,
    *,
    weight_store: "UserVerdictWeightStore | None" = None,
    base_weights: RerankWeights | None = None,
) -> tuple[float, list[str]]:
    """Score a candidate with per-user verdict adjustments applied on top."""
    from memory.state_store import USER_VERDICT_WEIGHT_STORE
    store = weight_store or USER_VERDICT_WEIGHT_STORE
    adjustments = store.get_adjustments(user_id)

    score, reasons = score_candidate(candidate, context, base_weights)

    # Apply user-specific tag bonuses/penalties
    tags_lower = {tag.lower() for tag in candidate.tags}
    for raw_tag, delta in adjustments.items():
        tag_value = raw_tag.split(":", 1)[-1].lower() if ":" in raw_tag else raw_tag.lower()
        if tag_value in tags_lower and delta != 0.0:
            score += delta
            reasons.append(f"user_feedback:{raw_tag}")

    return score, reasons
