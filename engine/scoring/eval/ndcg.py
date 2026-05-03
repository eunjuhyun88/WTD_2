"""NDCG@k and MAP@k evaluation for search ranking quality.

numpy-only implementation — no sklearn dependency.

Functions:
  ndcg_at_k(y_true_relevance, y_pred_scores, k) -> float
  map_at_k(y_true_binary, y_pred_scores, k) -> float
  paired_bootstrap_ci(baseline_scores, model_scores, n_resamples=1000, ci=0.95)
      -> (mean_delta, ci_lower, ci_upper)
  per_pattern_ndcg(queries_df, k) -> dict[str, float]
      queries_df: DataFrame with columns [query_id, pattern_slug, relevance, pred_score]
"""
from __future__ import annotations

import numpy as np
from typing import TYPE_CHECKING, Sequence

if TYPE_CHECKING:
    import pandas as pd


def ndcg_at_k(y_true: Sequence[float], y_pred: Sequence[float], k: int = 5) -> float:
    """Normalized Discounted Cumulative Gain @ k.

    y_true: relevance labels (higher = more relevant)
    y_pred: predicted scores (higher = ranked earlier)

    Returns a value in [0.0, 1.0]; 1.0 = perfect ranking.
    Returns 0.0 if k < 1 or all relevances are zero.
    """
    if k < 1:
        return 0.0

    y_true_arr = np.asarray(y_true, dtype=float)
    y_pred_arr = np.asarray(y_pred, dtype=float)

    if len(y_true_arr) == 0:
        return 0.0

    # Rank by predicted score (descending)
    sorted_by_pred = np.argsort(-y_pred_arr)[:k]
    # Ideal: sort by true relevance (descending)
    sorted_ideal = np.argsort(-y_true_arr)[:k]

    def _dcg(relevances: np.ndarray) -> float:
        gains = relevances[:k]
        discounts = np.log2(np.arange(2, len(gains) + 2))  # log2(2), log2(3), ...
        return float(np.sum(gains / discounts))

    dcg = _dcg(y_true_arr[sorted_by_pred])
    idcg = _dcg(y_true_arr[sorted_ideal])

    if idcg == 0.0:
        return 0.0
    return dcg / idcg


def map_at_k(y_true: Sequence[int], y_pred: Sequence[float], k: int = 10) -> float:
    """Mean Average Precision @ k.

    y_true: binary relevance (0 or 1)
    y_pred: predicted scores (higher = ranked earlier)

    Returns average precision over the top-k ranked items.
    Returns 0.0 if no relevant items exist in top-k.
    """
    if k < 1:
        return 0.0

    y_true_arr = np.asarray(y_true, dtype=int)
    y_pred_arr = np.asarray(y_pred, dtype=float)

    if len(y_true_arr) == 0:
        return 0.0

    # Sort by predicted score (descending), take top-k
    sorted_indices = np.argsort(-y_pred_arr)[:k]
    ranked_labels = y_true_arr[sorted_indices]

    precisions = []
    n_relevant = 0
    for i, label in enumerate(ranked_labels):
        if label == 1:
            n_relevant += 1
            precisions.append(n_relevant / (i + 1))

    if not precisions:
        return 0.0
    return float(np.mean(precisions))


def paired_bootstrap_ci(
    baseline: Sequence[float],
    model: Sequence[float],
    n_resamples: int = 1_000,
    ci: float = 0.95,
) -> tuple[float, float, float]:
    """Paired bootstrap confidence interval for the mean difference (model - baseline).

    Each element of baseline/model should be a per-query metric score (e.g. NDCG@5
    for that query). Bootstrap resamples query indices with replacement and computes
    the mean delta for each resample.

    Returns: (mean_delta, ci_lower, ci_upper)

    Promote condition: ci_lower > +0.05 (per W-0394 AC2)

    Args:
        baseline:    per-query scores for the baseline ranker
        model:       per-query scores for the candidate model
        n_resamples: number of bootstrap iterations (default 1000)
        ci:          confidence interval width (default 0.95 → 95% CI)
    """
    base_arr = np.asarray(baseline, dtype=float)
    model_arr = np.asarray(model, dtype=float)

    if len(base_arr) != len(model_arr):
        raise ValueError(
            f"baseline and model must have equal length, "
            f"got {len(base_arr)} vs {len(model_arr)}"
        )

    n = len(base_arr)
    if n == 0:
        return 0.0, 0.0, 0.0

    deltas = model_arr - base_arr
    mean_delta = float(np.mean(deltas))

    rng = np.random.default_rng(seed=42)
    boot_means = np.empty(n_resamples, dtype=float)
    for i in range(n_resamples):
        idx = rng.integers(0, n, size=n)
        boot_means[i] = deltas[idx].mean()

    alpha = 1.0 - ci
    ci_lower = float(np.percentile(boot_means, 100 * alpha / 2))
    ci_upper = float(np.percentile(boot_means, 100 * (1 - alpha / 2)))

    return mean_delta, ci_lower, ci_upper


def per_pattern_ndcg(queries_df: "pd.DataFrame", k: int = 5) -> dict[str, float]:
    """Compute NDCG@k broken down by pattern_slug.

    queries_df columns: query_id, pattern_slug, relevance, pred_score
    Returns: {pattern_slug: ndcg_score}

    Each unique (query_id, pattern_slug) pair is treated as a separate ranking
    task. The final NDCG per pattern_slug is the mean over its query_ids.
    """
    required = {"query_id", "pattern_slug", "relevance", "pred_score"}
    missing = required - set(queries_df.columns)
    if missing:
        raise ValueError(f"queries_df missing columns: {missing}")

    result: dict[str, list[float]] = {}

    for (query_id, pattern_slug), group in queries_df.groupby(["query_id", "pattern_slug"]):
        score = ndcg_at_k(
            y_true=group["relevance"].tolist(),
            y_pred=group["pred_score"].tolist(),
            k=k,
        )
        result.setdefault(str(pattern_slug), []).append(score)

    return {slug: float(np.mean(scores)) for slug, scores in result.items()}
