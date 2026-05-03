"""Known-answer tests for NDCG@k, MAP@k, and bootstrap CI.

All tests use numpy-only implementation in scoring.eval.ndcg.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from scoring.eval.ndcg import (
    map_at_k,
    ndcg_at_k,
    paired_bootstrap_ci,
    per_pattern_ndcg,
)


# ─── NDCG@k ──────────────────────────────────────────────────────────────────

def test_ndcg_perfect_ranking() -> None:
    """Perfect ranking: predicted score order matches relevance order → NDCG=1.0."""
    y_true = [3.0, 2.0, 1.0, 0.0, 0.0]
    y_pred = [0.9, 0.7, 0.5, 0.3, 0.1]
    score = ndcg_at_k(y_true, y_pred, k=5)
    assert abs(score - 1.0) < 1e-9, f"Expected 1.0, got {score}"


def test_ndcg_worst_ranking() -> None:
    """Reverse ranking: worst items ranked first → NDCG < 1.0 (clearly sub-optimal).

    Using items with a clear relevance gap: [3,0,0,0,0] reversed so the only
    relevant item is ranked last, guaranteeing NDCG@5 is well below 1.0.
    """
    # Only one truly relevant item with high relevance; reverse order puts it last
    y_true = [3.0, 0.0, 0.0, 0.0, 0.0]
    y_pred = [0.1, 0.3, 0.5, 0.7, 0.9]  # lowest score item has highest relevance
    score = ndcg_at_k(y_true, y_pred, k=5)
    # DCG@5 = 3/log2(6) ≈ 0.387 * (1/IDCG) where IDCG = 3/log2(2) = 3.0
    # NDCG = 0.387 / 3 ≈ 0.129 — well below 1.0
    assert score < 0.5, f"Expected < 0.5 for reversed ranking with one relevant item, got {score}"


def test_ndcg_zero_relevance() -> None:
    """All relevance=0 → NDCG=0.0 (no relevant items)."""
    y_true = [0.0, 0.0, 0.0]
    y_pred = [0.9, 0.5, 0.1]
    score = ndcg_at_k(y_true, y_pred, k=3)
    assert score == 0.0, f"Expected 0.0 for all-zero relevance, got {score}"


def test_ndcg_k_equals_1() -> None:
    """NDCG@1: only the top-ranked item matters."""
    y_true = [0.0, 3.0, 1.0]
    y_pred = [0.9, 0.5, 0.1]  # top prediction has relevance=0
    score = ndcg_at_k(y_true, y_pred, k=1)
    assert score == 0.0, f"NDCG@1 should be 0 when top item has relevance=0, got {score}"


def test_ndcg_known_value() -> None:
    """Manual DCG/IDCG calculation for a known input."""
    # Relevances: [3, 2, 3, 0, 1, 2] (positions by pred score order)
    # Pred order: indices [0, 2, 1, 5, 4, 3] → relevances [3, 3, 2, 2, 1, 0]
    # DCG@3 = 3/log2(2) + 3/log2(3) + 2/log2(4)
    #       = 3/1 + 3/1.585 + 2/2 = 3 + 1.893 + 1 = 5.893
    # IDCG@3 = 3/log2(2) + 3/log2(3) + 2/log2(4) = same = 5.893
    # → NDCG@3 = 1.0 because top-2 are tied at 3, then 2
    y_true = [3.0, 2.0, 3.0, 0.0, 1.0, 2.0]
    y_pred = [0.9, 0.6, 0.8, 0.1, 0.3, 0.5]
    score = ndcg_at_k(y_true, y_pred, k=3)
    # Manual: pred order gives relevances [3, 3, 2], ideal is [3, 3, 2] → NDCG=1.0
    assert abs(score - 1.0) < 1e-6, f"Expected ~1.0, got {score}"


def test_ndcg_empty_inputs() -> None:
    """Empty arrays → 0.0."""
    assert ndcg_at_k([], [], k=5) == 0.0


def test_ndcg_k_less_than_1() -> None:
    """k < 1 → 0.0."""
    assert ndcg_at_k([1.0, 2.0], [0.5, 0.8], k=0) == 0.0


# ─── MAP@k ────────────────────────────────────────────────────────────────────

def test_map_at_k_known() -> None:
    """[1,0,1,0,0] with perfect descending scores.

    Sorted by score: [1,0,1,0,0]
    Precision at hit positions: 1/1=1.0, 2/3≈0.667
    AP = mean(1.0, 0.667) = 0.833...
    """
    y_true = [1, 0, 1, 0, 0]
    y_pred = [0.9, 0.8, 0.7, 0.6, 0.5]  # descending — already sorted
    score = map_at_k(y_true, y_pred, k=5)
    expected = (1.0 + 2.0 / 3.0) / 2.0  # ≈ 0.8333
    assert abs(score - expected) < 1e-6, f"Expected {expected:.4f}, got {score:.4f}"


def test_map_at_k_no_relevant() -> None:
    """No relevant items in top-k → 0.0."""
    y_true = [0, 0, 0, 1]
    y_pred = [0.9, 0.8, 0.7, 0.1]  # the relevant item ranks last
    score = map_at_k(y_true, y_pred, k=3)
    assert score == 0.0, f"Expected 0.0, got {score}"


def test_map_at_k_all_relevant() -> None:
    """All items relevant, perfect order → MAP=1.0."""
    y_true = [1, 1, 1, 1, 1]
    y_pred = [0.9, 0.8, 0.7, 0.6, 0.5]
    score = map_at_k(y_true, y_pred, k=5)
    assert abs(score - 1.0) < 1e-9


def test_map_at_k_empty() -> None:
    """Empty arrays → 0.0."""
    assert map_at_k([], [], k=5) == 0.0


def test_map_at_k_k_less_than_1() -> None:
    """k < 1 → 0.0."""
    assert map_at_k([1, 0, 1], [0.9, 0.5, 0.1], k=0) == 0.0


# ─── Bootstrap CI ─────────────────────────────────────────────────────────────

def test_paired_bootstrap_significant() -> None:
    """Model clearly beats baseline → CI lower bound > 0."""
    rng = np.random.default_rng(42)
    baseline = rng.uniform(0.4, 0.6, size=100).tolist()
    # Add noise so deltas vary (otherwise all bootstrap samples have same mean)
    improvements = rng.uniform(0.10, 0.20, size=100).tolist()
    model = [b + d for b, d in zip(baseline, improvements)]

    mean_delta, ci_lower, ci_upper = paired_bootstrap_ci(
        baseline, model, n_resamples=2_000, ci=0.95
    )
    assert mean_delta > 0.0, f"Mean delta should be positive, got {mean_delta}"
    assert ci_lower > 0.0, f"CI lower should be > 0 for significant improvement, got {ci_lower}"
    assert ci_upper > ci_lower


def test_paired_bootstrap_not_significant() -> None:
    """No difference between model and baseline → CI lower bound < 0."""
    rng = np.random.default_rng(42)
    both = rng.uniform(0.4, 0.6, size=100).tolist()

    mean_delta, ci_lower, ci_upper = paired_bootstrap_ci(
        both, both, n_resamples=2_000, ci=0.95
    )
    assert abs(mean_delta) < 1e-10, f"Mean delta should be ~0, got {mean_delta}"
    assert ci_lower <= 0.0, f"CI lower should be ≤ 0 for no difference, got {ci_lower}"
    assert ci_upper >= 0.0


def test_paired_bootstrap_mismatched_lengths() -> None:
    """Mismatched array lengths raise ValueError."""
    with pytest.raises(ValueError, match="equal length"):
        paired_bootstrap_ci([0.5, 0.6], [0.5, 0.6, 0.7])


def test_paired_bootstrap_empty() -> None:
    """Empty arrays return (0.0, 0.0, 0.0)."""
    result = paired_bootstrap_ci([], [])
    assert result == (0.0, 0.0, 0.0)


# ─── per_pattern_ndcg ─────────────────────────────────────────────────────────

def test_per_pattern_ndcg() -> None:
    """Pattern-level NDCG computed correctly for two patterns."""
    df = pd.DataFrame({
        "query_id":    ["q1", "q1", "q1", "q2", "q2", "q2"],
        "pattern_slug":["pat_a", "pat_a", "pat_a", "pat_b", "pat_b", "pat_b"],
        "relevance":   [3.0, 1.0, 0.0, 1.0, 0.0, 0.0],
        "pred_score":  [0.9, 0.5, 0.1, 0.9, 0.5, 0.1],
    })
    result = per_pattern_ndcg(df, k=3)

    assert "pat_a" in result
    assert "pat_b" in result
    # pat_a: perfect ranking → NDCG@3 = 1.0
    assert abs(result["pat_a"] - 1.0) < 1e-6, f"pat_a: {result['pat_a']}"
    # pat_b: relevant item is top → NDCG@3 = 1.0
    assert abs(result["pat_b"] - 1.0) < 1e-6, f"pat_b: {result['pat_b']}"


def test_per_pattern_ndcg_missing_columns() -> None:
    """DataFrame missing required columns raises ValueError."""
    df = pd.DataFrame({"query_id": ["q1"], "pattern_slug": ["p1"]})
    with pytest.raises(ValueError, match="missing columns"):
        per_pattern_ndcg(df, k=5)


def test_per_pattern_ndcg_multiple_queries_per_pattern() -> None:
    """Average NDCG across multiple query_ids for same pattern."""
    df = pd.DataFrame({
        "query_id":    ["q1", "q1", "q2", "q2"],
        "pattern_slug":["pat_x", "pat_x", "pat_x", "pat_x"],
        "relevance":   [1.0, 0.0, 0.0, 1.0],
        "pred_score":  [0.9, 0.1, 0.9, 0.1],  # q1: perfect, q2: worst
    })
    result = per_pattern_ndcg(df, k=2)
    # q1: NDCG=1.0 (relevant item first), q2: NDCG=0.0 (relevant item last for k=1? no…)
    # q2 pred=[0.9, 0.1] → ranked [item0=rel0, item1=rel1] → relevant is idx1 ranked 2nd
    # DCG@2 = 0/log2(2) + 1/log2(3) = 0.631, IDCG@2 = 1/log2(2) = 1.0 → NDCG = 0.631
    assert "pat_x" in result
    # Average should be between 0 and 1
    assert 0.0 < result["pat_x"] < 1.0
