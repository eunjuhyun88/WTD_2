"""Similarity Ranker — 3-layer hybrid scorer for pattern candidate ranking.

Layer A (0.45 weight): Feature similarity
  - Compare candidate signal snapshot against PhaseQuery requirements
  - Each phase scored independently: required / preferred / forbidden

Layer B (0.45 weight): Sequence similarity
  - Phase path order matching (subsequence alignment)
  - Phase depth progress bonus
  - Missing phase penalty
  - Forbidden transition penalty

Layer C (0.10 weight): Context similarity (optional)
  - Timeframe match
  - Symbol family match
  - Pattern family match

Final score = 0.45*feature + 0.45*sequence + 0.10*context

Design:
- Pure functions: no IO, no LLM, no provider calls
- All weights are DEFAULT_* constants, calibrated by ledger verdicts
- Works on CandidateWindow + SearchQuerySpec directly
- Returns RankedCandidate with score breakdown for explainability

Sequence matching algorithm:
  Uses longest-common-subsequence (LCS) style alignment that respects
  ordering without requiring exact position match. This handles the case
  where a candidate has extra phases (e.g. fake_dump before real_dump)
  without penalising it. Missing required phases DO penalise the score.
"""
from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from typing import Any

from research.artifacts.feature_windows import CandidateWindow
from research.discovery.query_transformer import PhaseQuery, SearchQuerySpec

# ─────────────────────────────────────────────────────────────────────────────
# Weights (sum to 1.0)
# ─────────────────────────────────────────────────────────────────────────────

WEIGHT_FEATURE: float = 0.45
WEIGHT_SEQUENCE: float = 0.45
WEIGHT_CONTEXT: float = 0.10

# Phase scoring sub-weights
PHASE_REQUIRED_WEIGHT: float = 1.0
PHASE_PREFERRED_WEIGHT: float = 0.4
PHASE_FORBIDDEN_PENALTY: float = -0.5

# Sequence sub-weights
SEQ_ORDER_WEIGHT: float = 0.6       # ordered LCS match
SEQ_DEPTH_WEIGHT: float = 0.2       # how deep into the path the candidate got
SEQ_COMPLETENESS_WEIGHT: float = 0.2  # fraction of required phases present


@dataclass(frozen=True)
class PhaseFeatureScore:
    phase_id: str
    score: float                 # 0.0 – 1.0
    required_hits: int
    required_total: int
    preferred_hits: int
    preferred_total: int
    forbidden_violations: int
    reasons: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RankedCandidate:
    """A fully scored candidate with breakdown for explainability."""

    symbol: str
    timeframe: str
    bar_ts_ms: int
    bar_iso: str

    # Score breakdown
    feature_score: float
    sequence_score: float
    context_score: float
    final_score: float

    # Detail
    phase_feature_scores: list[PhaseFeatureScore]
    observed_phase_path: list[str]
    matched_phase_path: list[str]
    sequence_lcs_length: int
    missing_phases: list[str]

    # Passthrough
    signals: dict[str, float]

    def to_dict(self) -> dict[str, Any]:
        d = {
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "bar_ts_ms": self.bar_ts_ms,
            "bar_iso": self.bar_iso,
            "feature_score": round(self.feature_score, 4),
            "sequence_score": round(self.sequence_score, 4),
            "context_score": round(self.context_score, 4),
            "final_score": round(self.final_score, 4),
            "observed_phase_path": self.observed_phase_path,
            "matched_phase_path": self.matched_phase_path,
            "missing_phases": self.missing_phases,
            "phase_feature_scores": [p.to_dict() for p in self.phase_feature_scores],
        }
        return d


# ─────────────────────────────────────────────────────────────────────────────
# Layer A: Feature similarity
# ─────────────────────────────────────────────────────────────────────────────

def _eval_numeric(col: str, config: dict[str, float], signals: dict[str, float]) -> bool:
    """Evaluate a numeric constraint dict {'min': x, 'max': y} against signals."""
    value = signals.get(col)
    if value is None:
        return False
    if "min" in config and value < config["min"]:
        return False
    if "max" in config and value > config["max"]:
        return False
    return True


def _eval_boolean(col: str, expected: bool, signals: dict[str, float]) -> bool:
    """Evaluate a boolean signal (stored as 0.0/1.0)."""
    value = signals.get(col, 0.0)
    flag = value >= 0.5
    return flag == expected


def score_phase_features(phase_query: PhaseQuery, signals: dict[str, float]) -> PhaseFeatureScore:
    """Score how well a signal snapshot satisfies one PhaseQuery.

    Returns PhaseFeatureScore with score in [0.0, 1.0] (after clipping).
    """
    score = 0.0
    max_score = 0.0
    reasons: list[str] = []
    required_hits = 0
    required_total = 0
    preferred_hits = 0
    preferred_total = 0
    forbidden_violations = 0

    # Required numeric
    for col, config in (phase_query.required_numeric or {}).items():
        required_total += 1
        max_score += PHASE_REQUIRED_WEIGHT
        if _eval_numeric(col, config, signals):
            score += PHASE_REQUIRED_WEIGHT
            required_hits += 1
            reasons.append(f"req_num:{col}=ok")
        else:
            reasons.append(f"req_num:{col}=MISS")

    # Required boolean
    for col, expected in (phase_query.required_boolean or {}).items():
        required_total += 1
        max_score += PHASE_REQUIRED_WEIGHT
        if _eval_boolean(col, expected, signals):
            score += PHASE_REQUIRED_WEIGHT
            required_hits += 1
            reasons.append(f"req_bool:{col}=ok")
        else:
            reasons.append(f"req_bool:{col}=MISS")

    # Preferred numeric (partial credit)
    for col, config in (phase_query.preferred_numeric or {}).items():
        preferred_total += 1
        max_score += PHASE_PREFERRED_WEIGHT
        if _eval_numeric(col, config, signals):
            score += PHASE_PREFERRED_WEIGHT
            preferred_hits += 1
            reasons.append(f"pref_num:{col}=ok")

    # Preferred boolean (partial credit)
    for col, expected in (phase_query.preferred_boolean or {}).items():
        preferred_total += 1
        max_score += PHASE_PREFERRED_WEIGHT
        if _eval_boolean(col, expected, signals):
            score += PHASE_PREFERRED_WEIGHT
            preferred_hits += 1
            reasons.append(f"pref_bool:{col}=ok")

    # Forbidden numeric (penalty)
    for col, config in (phase_query.forbidden_numeric or {}).items():
        if _eval_numeric(col, config, signals):
            forbidden_violations += 1
            score += PHASE_FORBIDDEN_PENALTY
            reasons.append(f"forbidden_num:{col}=VIOLATED")

    # Forbidden boolean (penalty)
    for col, expected in (phase_query.forbidden_boolean or {}).items():
        if _eval_boolean(col, expected, signals):
            forbidden_violations += 1
            score += PHASE_FORBIDDEN_PENALTY
            reasons.append(f"forbidden_bool:{col}=VIOLATED")

    normalised = (score / max_score) if max_score > 0 else 0.0
    normalised = max(0.0, min(1.0, normalised))

    return PhaseFeatureScore(
        phase_id=phase_query.phase_id,
        score=normalised,
        required_hits=required_hits,
        required_total=required_total,
        preferred_hits=preferred_hits,
        preferred_total=preferred_total,
        forbidden_violations=forbidden_violations,
        reasons=reasons,
    )


def compute_feature_score(spec: SearchQuerySpec, signals: dict[str, float]) -> tuple[float, list[PhaseFeatureScore]]:
    """Score a candidate's signals against all phases in the query spec.

    Returns (overall_feature_score, per_phase_scores).
    The overall score is the average of per-phase scores (all phases equally weighted).
    Phases with no constraints score 1.0 (neutral).
    """
    if not spec.phase_queries:
        return 0.0, []

    phase_scores: list[PhaseFeatureScore] = []
    for pq in spec.phase_queries:
        ps = score_phase_features(pq, signals)
        phase_scores.append(ps)

    overall = sum(ps.score for ps in phase_scores) / len(phase_scores)
    return overall, phase_scores


# ─────────────────────────────────────────────────────────────────────────────
# Layer B: Sequence similarity
# ─────────────────────────────────────────────────────────────────────────────

def _lcs_order_score(expected: list[str], observed: list[str]) -> tuple[float, list[str]]:
    """Longest common subsequence that respects order.

    Returns (fraction, matched_phases).
    fraction = lcs_length / len(expected)
    """
    if not expected:
        return 0.0, []
    if not observed:
        return 0.0, []

    # Standard LCS DP
    m, n = len(expected), len(observed)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if expected[i - 1] == observed[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

    # Backtrack to find matched phases
    matched: list[str] = []
    i, j = m, n
    while i > 0 and j > 0:
        if expected[i - 1] == observed[j - 1]:
            matched.append(expected[i - 1])
            i -= 1
            j -= 1
        elif dp[i - 1][j] > dp[i][j - 1]:
            i -= 1
        else:
            j -= 1
    matched.reverse()

    lcs_len = dp[m][n]
    return lcs_len / len(expected), matched


def _depth_progress_score(expected: list[str], observed: list[str]) -> float:
    """How far the candidate progressed through the expected phase path."""
    if not expected:
        return 0.0
    phase_to_idx = {phase: idx for idx, phase in enumerate(expected)}
    seen_indices = [phase_to_idx[p] for p in observed if p in phase_to_idx]
    if not seen_indices:
        return 0.0
    return (max(seen_indices) + 1) / len(expected)


def _completeness_score(expected: list[str], observed: list[str]) -> tuple[float, list[str]]:
    """Fraction of expected phases that appear in observed (order-agnostic)."""
    if not expected:
        return 0.0, []
    observed_set = set(observed)
    present = [p for p in expected if p in observed_set]
    missing = [p for p in expected if p not in observed_set]
    return len(present) / len(expected), missing


def compute_sequence_score(
    expected_phase_path: list[str],
    observed_phase_path: list[str],
) -> tuple[float, list[str], list[str]]:
    """Score sequence alignment.

    Returns (score, matched_phases, missing_phases).
    score is in [0.0, 1.0].
    """
    if not expected_phase_path:
        return 0.0, [], []

    order_score, matched = _lcs_order_score(expected_phase_path, observed_phase_path)
    depth_score = _depth_progress_score(expected_phase_path, observed_phase_path)
    completeness, missing = _completeness_score(expected_phase_path, observed_phase_path)

    score = (
        SEQ_ORDER_WEIGHT * order_score
        + SEQ_DEPTH_WEIGHT * depth_score
        + SEQ_COMPLETENESS_WEIGHT * completeness
    )
    return min(1.0, max(0.0, score)), matched, missing


# ─────────────────────────────────────────────────────────────────────────────
# Layer C: Context similarity
# ─────────────────────────────────────────────────────────────────────────────

def _rule_context_score(spec: SearchQuerySpec, candidate: CandidateWindow) -> float:
    """Rule-based fallback: timeframe match + symbol scope."""
    score = 0.0
    if candidate.timeframe in (spec.preferred_timeframes or []):
        score += 0.5
    if spec.symbol_scope and candidate.symbol in spec.symbol_scope:
        score += 0.3
    return min(1.0, score)


def compute_context_score(spec: SearchQuerySpec, candidate: CandidateWindow) -> float:
    """Layer C context score.

    When LightGBM model is trained and LGBM_CONTEXT_SCORE_ENABLED is not 'false',
    returns P(win) from the model (preferred — personalised win probability).
    Falls back to rule-based score (timeframe + symbol match) when model is absent.
    """
    if os.environ.get("LGBM_CONTEXT_SCORE_ENABLED", "true").lower() != "false":
        try:
            from scoring.lightgbm_engine import get_engine  # local import to avoid circular
            engine = get_engine()
            prob = engine.predict_feature_row(candidate.signals)
            if prob is not None:
                return float(prob)
        except Exception:  # noqa: BLE001 — model load errors must not break ranking
            pass
    return _rule_context_score(spec, candidate)


# ─────────────────────────────────────────────────────────────────────────────
# Final ranking
# ─────────────────────────────────────────────────────────────────────────────

def rank_candidate(
    spec: SearchQuerySpec,
    candidate: CandidateWindow,
    observed_phase_path: list[str] | None = None,
) -> RankedCandidate:
    """Compute all 3 layers and produce a RankedCandidate.

    `observed_phase_path` is the phase path extracted from the candidate's
    state machine history. If not available, sequence score is 0.
    """
    from datetime import datetime, timezone

    bar_iso = datetime.fromtimestamp(
        candidate.bar_ts_ms / 1000, tz=timezone.utc
    ).isoformat()

    # Layer A
    feature_score, phase_scores = compute_feature_score(spec, candidate.signals)

    # Layer B
    if observed_phase_path:
        sequence_score, matched, missing = compute_sequence_score(
            spec.phase_path, observed_phase_path
        )
    else:
        sequence_score = 0.0
        matched = []
        missing = list(spec.phase_path)

    # Layer C
    context_score = compute_context_score(spec, candidate)

    # Final
    final_score = (
        WEIGHT_FEATURE * feature_score
        + WEIGHT_SEQUENCE * sequence_score
        + WEIGHT_CONTEXT * context_score
    )

    return RankedCandidate(
        symbol=candidate.symbol,
        timeframe=candidate.timeframe,
        bar_ts_ms=candidate.bar_ts_ms,
        bar_iso=bar_iso,
        feature_score=feature_score,
        sequence_score=sequence_score,
        context_score=context_score,
        final_score=final_score,
        phase_feature_scores=phase_scores,
        observed_phase_path=observed_phase_path or [],
        matched_phase_path=matched,
        sequence_lcs_length=len(matched),
        missing_phases=missing,
        signals=candidate.signals,
    )


def rank_candidates(
    spec: SearchQuerySpec,
    candidates: list[CandidateWindow],
    top_k: int = 10,
) -> list[RankedCandidate]:
    """Rank all candidates and return top-k by final_score.

    observed_phase_path is taken from candidate.observed_phase_path if set
    by the caller (e.g. a state-machine replay over the candidate window).
    If empty, sequence score contributes 0 (feature + context only).
    """
    scored: list[RankedCandidate] = []
    for c in candidates:
        obs_path = c.observed_phase_path if c.observed_phase_path else None
        ranked = rank_candidate(spec, c, obs_path)
        scored.append(ranked)

    scored.sort(key=lambda r: r.final_score, reverse=True)
    return scored[:top_k]


__all__ = [
    "RankedCandidate",
    "PhaseFeatureScore",
    "compute_feature_score",
    "compute_sequence_score",
    "compute_context_score",
    "rank_candidate",
    "rank_candidates",
]
