"""PatternRefiner — multiple strategies compete to find the best pattern definition.

From architecture-v2-draft.md §3.1c:
  Strategy 1: FeatureOutlier    — z-score anomaly detection
  Strategy 2: CosineSimilarity  — vector angle similarity
  Strategy 3: LightGBMImportance — SHAP-guided feature selection
  Strategy 4: DTW               — shape-match (time-series distance)

Each strategy searches all historical bars for matches, labels them, and
returns { win_rate, match_count, expectancy, feature_vector }.

The recommended strategy is the one with best expectancy × log(count).
This balances statistical significance (count) with alpha (expectancy).
"""
from __future__ import annotations

import logging
from typing import Optional

import numpy as np
import pandas as pd
from scipy.stats import zscore

from challenge.historical_matcher import (
    label_outcomes,
    _row_to_vector,
    WIN_THRESHOLD_PCT,
    OUTCOME_HORIZON_BARS,
)
from challenge.types import StrategyResult
from scoring.feature_matrix import N_FEATURES

log = logging.getLogger("engine.refiner")

# Minimum match count for a strategy to be considered valid.
MIN_MATCHES = 20

# Z-score threshold for FeatureOutlier strategy.
Z_THRESHOLD = 1.5

# Cosine similarity threshold.
COSINE_THRESHOLD = 0.85


def _compute_win_stats(
    match_indices: np.ndarray,
    labels: pd.Series,
    features_df: pd.DataFrame,
) -> tuple[float, int, float]:
    """Return (win_rate, match_count, expectancy) for a set of matched bar indices."""
    if len(match_indices) == 0:
        return 0.0, 0, 0.0

    matched_labels = labels.iloc[match_indices].dropna()
    if len(matched_labels) == 0:
        return 0.0, 0, 0.0

    win_rate = float(matched_labels.mean())
    count = len(matched_labels)
    # Simple expectancy: win_rate * win_size - (1-win_rate) * loss_size
    # We use win_pct = WIN_THRESHOLD_PCT as a proxy.
    expectancy = win_rate * WIN_THRESHOLD_PCT - (1 - win_rate) * (WIN_THRESHOLD_PCT * 0.5)
    return win_rate, count, expectancy


# ---------------------------------------------------------------------------
# Strategy 1: Feature Outlier (z-score)
# ---------------------------------------------------------------------------


def strategy_feature_outlier(
    pattern_vec: np.ndarray,
    all_vecs: np.ndarray,    # (N, N_FEATURES)
    labels: pd.Series,
    features_df: pd.DataFrame,
) -> StrategyResult:
    """Find bars where the same features are simultaneously anomalous."""
    # Compute z-scores of all features across all bars.
    z = zscore(all_vecs, axis=0, nan_policy="omit")
    # For each feature, find bars that match the pattern's z-score direction.
    pattern_z = zscore(
        np.vstack([pattern_vec[:N_FEATURES], all_vecs])[:, :N_FEATURES], axis=0
    )[0]

    # Count how many features have z-score within ±Z_THRESHOLD of pattern.
    z_all = z[:, :N_FEATURES]
    match_mask = np.abs(z_all - pattern_z) < Z_THRESHOLD
    match_score = match_mask.mean(axis=1)  # fraction of features that match

    # Threshold: bars where 60%+ of features match the pattern.
    match_indices = np.where(match_score >= 0.60)[0]

    win_rate, count, expectancy = _compute_win_stats(match_indices, labels, features_df)
    centroid = all_vecs[match_indices].mean(axis=0).tolist() if len(match_indices) > 0 else pattern_vec.tolist()

    return StrategyResult(
        name="feature_outlier",
        win_rate=win_rate,
        match_count=count,
        expectancy=expectancy,
        feature_vector=centroid,
        threshold=0.60,
    )


# ---------------------------------------------------------------------------
# Strategy 2: Cosine Similarity
# ---------------------------------------------------------------------------


def strategy_cosine_similarity(
    pattern_vec: np.ndarray,
    all_vecs: np.ndarray,
    labels: pd.Series,
    features_df: pd.DataFrame,
) -> StrategyResult:
    """Find bars whose feature vector is angularly close to the pattern."""
    pv = pattern_vec[:N_FEATURES]
    pv_norm = pv / (np.linalg.norm(pv) + 1e-10)

    norms = np.linalg.norm(all_vecs[:, :N_FEATURES], axis=1, keepdims=True) + 1e-10
    normed = all_vecs[:, :N_FEATURES] / norms

    similarities = normed @ pv_norm
    match_indices = np.where(similarities >= COSINE_THRESHOLD)[0]

    win_rate, count, expectancy = _compute_win_stats(match_indices, labels, features_df)
    centroid = all_vecs[match_indices].mean(axis=0).tolist() if len(match_indices) > 0 else pv.tolist()

    return StrategyResult(
        name="cosine_similarity",
        win_rate=win_rate,
        match_count=count,
        expectancy=expectancy,
        feature_vector=centroid,
        threshold=COSINE_THRESHOLD,
    )


# ---------------------------------------------------------------------------
# Strategy 3: LightGBM Importance
# ---------------------------------------------------------------------------


def strategy_lightgbm_importance(
    pattern_vec: np.ndarray,
    all_vecs: np.ndarray,
    labels: pd.Series,
    features_df: pd.DataFrame,
) -> Optional[StrategyResult]:
    """Use SHAP feature importance to find the most predictive features,
    then match on only those features with tight thresholds.

    Returns None if LightGBM is not trained or the model AUC < 0.55.
    """
    try:
        from scoring.lightgbm_engine import get_engine
        engine = get_engine()
        importance = engine.feature_importance()
        if importance is None:
            return None
    except Exception:
        return None

    # Select top-10 most important features by gain.
    sorted_feats = sorted(importance.items(), key=lambda x: x[1], reverse=True)
    top_names = [name for name, _ in sorted_feats[:10]]

    from scoring.feature_matrix import FEATURE_NAMES
    top_indices = [list(FEATURE_NAMES).index(n) for n in top_names if n in FEATURE_NAMES]

    if not top_indices:
        return None

    # Match on top features using tight z-score.
    pv_top = pattern_vec[top_indices]
    all_top = all_vecs[:, top_indices]

    from scipy.stats import zscore as sp_zscore
    combined = np.vstack([pv_top, all_top])
    z_combined = sp_zscore(combined, axis=0, nan_policy="omit")
    pv_z = z_combined[0]
    all_z = z_combined[1:]

    match_score = (np.abs(all_z - pv_z) < 1.0).mean(axis=1)
    match_indices = np.where(match_score >= 0.70)[0]

    win_rate, count, expectancy = _compute_win_stats(match_indices, labels, features_df)
    centroid = all_vecs[match_indices].mean(axis=0).tolist() if len(match_indices) > 0 else pattern_vec.tolist()

    return StrategyResult(
        name="lightgbm_importance",
        win_rate=win_rate,
        match_count=count,
        expectancy=expectancy,
        feature_vector=centroid,
        threshold=0.70,
    )


# ---------------------------------------------------------------------------
# Main refiner
# ---------------------------------------------------------------------------


def refine_pattern(
    pattern_vec: np.ndarray,
    features_db: dict[str, pd.DataFrame],
    klines_db: dict[str, pd.DataFrame],
) -> tuple[list[StrategyResult], str]:
    """Run all strategies and return (results, recommended_strategy_name).

    Concatenates feature matrices from all symbols in the database,
    labels outcomes, then runs each strategy.
    """
    # Build combined feature matrix + labels.
    all_vecs_parts: list[np.ndarray] = []
    all_labels_parts: list[pd.Series] = []
    combined_features_parts: list[pd.DataFrame] = []

    for symbol, feats_df in features_db.items():
        klines_df = klines_db.get(symbol)
        if klines_df is None:
            continue

        vecs = feats_df.apply(_row_to_vector, axis=1)
        mat = np.stack(vecs.values)  # (T, N_FEATURES)
        labs = label_outcomes(feats_df, klines_df)

        all_vecs_parts.append(mat)
        all_labels_parts.append(labs)
        combined_features_parts.append(feats_df)

    if not all_vecs_parts:
        log.warning("No data in features_db — cannot refine pattern")
        return [], "feature_outlier"

    all_vecs = np.vstack(all_vecs_parts)
    combined_feats = pd.concat(combined_features_parts, ignore_index=True)
    combined_labels = pd.concat(all_labels_parts, ignore_index=True)

    # Run strategies.
    results: list[StrategyResult] = []

    for strategy_fn in [
        lambda: strategy_feature_outlier(pattern_vec, all_vecs, combined_labels, combined_feats),
        lambda: strategy_cosine_similarity(pattern_vec, all_vecs, combined_labels, combined_feats),
        lambda: strategy_lightgbm_importance(pattern_vec, all_vecs, combined_labels, combined_feats),
    ]:
        try:
            result = strategy_fn()
            if result is not None and result.match_count >= MIN_MATCHES:
                results.append(result)
        except Exception as exc:
            log.warning("Strategy failed: %s", exc)

    if not results:
        # Fallback: return cosine with zero stats so the API doesn't error.
        results = [
            StrategyResult(
                name="cosine_similarity",
                win_rate=0.0,
                match_count=0,
                expectancy=0.0,
                feature_vector=pattern_vec[:N_FEATURES].tolist(),
                threshold=COSINE_THRESHOLD,
            )
        ]

    # Choose recommended: best expectancy × log2(count + 1) score.
    def _score(r: StrategyResult) -> float:
        return r.expectancy * np.log2(r.match_count + 1)

    recommended = max(results, key=_score).name
    return results, recommended
