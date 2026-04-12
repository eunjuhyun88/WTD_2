"""Similarity Search Engine: find historical cases most similar to the current snapshot.

AI Researcher rationale:
    LightGBM learns global decision boundaries — it tells you "this looks bullish".
    Similarity search provides *local evidence* — "here are 15 times the market
    looked exactly like this, and 11 of them went up".

    The combination is powerful:
    - LightGBM generalizes across regimes → robust but low-conviction
    - Similarity search retrieves regime-specific evidence → high-conviction but sparse
    - User sees both: "P(win) = 62% AND 73% of similar cases hit target"

Design:
    1. Build an index of historical feature snapshots (offline, after feature_calc)
    2. For a query snapshot, find top-K nearest neighbors
    3. Return similarity scores + outcome labels for each neighbor
    4. Aggregate: win rate, avg PnL, regime distribution

Distance metric: Cosine similarity on z-scored features.
    - Cosine is scale-invariant → no need for manual feature weighting
    - Z-scoring first ensures all features contribute proportionally
    - Much faster than DTW for 28-D vectors (DTW reserved for multi-bar patterns)

Index structure:
    - For N < 100K: brute-force numpy (fast enough, ~5ms for 75K vectors)
    - For N > 100K: FAISS IVF (future upgrade, not needed yet)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from scoring.feature_matrix import encode_features_df, FEATURE_NAMES


@dataclass
class SimilarCase:
    """A single historical case similar to the query."""
    timestamp: pd.Timestamp
    similarity: float          # cosine similarity [0, 1]
    features: dict[str, float]  # key features for explainability
    outcome: Optional[int]     # 1=win, 0=loss, None=unlabelled
    pnl_pct: Optional[float]   # realized PnL if available
    regime: str                # regime at the time


@dataclass
class SimilarityResult:
    """Aggregated similarity search results."""
    cases: list[SimilarCase]
    n_total: int               # total cases in index
    n_similar: int             # cases above threshold
    win_rate: Optional[float]  # win rate among labelled similar cases
    avg_pnl: Optional[float]   # average PnL among labelled similar cases
    regime_distribution: dict[str, int]  # regime counts among similar cases
    confidence: str            # "high" (≥20 cases, win_rate clear) | "medium" | "low"

    def to_dict(self) -> dict:
        return {
            "n_total": self.n_total,
            "n_similar": self.n_similar,
            "win_rate": round(self.win_rate, 4) if self.win_rate is not None else None,
            "avg_pnl": round(self.avg_pnl, 6) if self.avg_pnl is not None else None,
            "regime_distribution": self.regime_distribution,
            "confidence": self.confidence,
            "cases": [
                {
                    "timestamp": str(c.timestamp),
                    "similarity": round(c.similarity, 4),
                    "outcome": c.outcome,
                    "pnl_pct": round(c.pnl_pct, 6) if c.pnl_pct is not None else None,
                    "regime": c.regime,
                }
                for c in self.cases
            ],
        }


class SimilarityIndex:
    """In-memory similarity search index over historical feature snapshots.

    Build once from a features DataFrame + labels, then query repeatedly.
    Thread-safe for reads (numpy operations are GIL-friendly).
    """

    def __init__(self) -> None:
        self._X: Optional[np.ndarray] = None       # z-scored feature matrix (N, D)
        self._norms: Optional[np.ndarray] = None    # L2 norms for cosine
        self._index: Optional[pd.DatetimeIndex] = None
        self._labels: Optional[np.ndarray] = None   # 1/0/-1 or NaN
        self._pnls: Optional[np.ndarray] = None
        self._regimes: Optional[np.ndarray] = None
        self._mean: Optional[np.ndarray] = None     # feature means for z-scoring
        self._std: Optional[np.ndarray] = None      # feature stds for z-scoring
        self._n: int = 0

    @property
    def is_built(self) -> bool:
        return self._X is not None and self._n > 0

    @property
    def size(self) -> int:
        return self._n

    def build(
        self,
        features_df: pd.DataFrame,
        labels: Optional[np.ndarray] = None,
        pnls: Optional[np.ndarray] = None,
        regimes: Optional[np.ndarray] = None,
    ) -> None:
        """Build the index from a features DataFrame.

        Args:
            features_df: output of compute_features_table(), must have DatetimeIndex.
            labels:      optional int array (1=win, 0=loss) aligned to features_df.
            pnls:        optional float array of realized PnL aligned to features_df.
            regimes:     optional string array of regime labels.
        """
        X = encode_features_df(features_df)
        n, d = X.shape

        # Z-score normalization (robust to outliers via clipping at ±5σ)
        self._mean = X.mean(axis=0)
        self._std = X.std(axis=0)
        self._std[self._std < 1e-10] = 1.0  # avoid division by zero
        X_z = (X - self._mean) / self._std
        X_z = np.clip(X_z, -5.0, 5.0)

        # Pre-compute L2 norms for cosine similarity
        norms = np.linalg.norm(X_z, axis=1, keepdims=True)
        norms[norms < 1e-10] = 1.0
        self._X = X_z / norms  # unit-normalized for cosine = dot product

        self._index = features_df.index.copy()
        self._labels = labels if labels is not None else np.full(n, np.nan)
        self._pnls = pnls if pnls is not None else np.full(n, np.nan)
        self._regimes = regimes if regimes is not None else np.array(["unknown"] * n)
        self._n = n

    def query(
        self,
        features_df: pd.DataFrame,
        *,
        top_k: int = 20,
        min_similarity: float = 0.80,
    ) -> SimilarityResult:
        """Find the top-K most similar historical cases to the last row.

        Args:
            features_df: features DataFrame (only the last row is used as query).
            top_k:       max number of results.
            min_similarity: minimum cosine similarity threshold.

        Returns:
            SimilarityResult with cases, win rate, and confidence.
        """
        if not self.is_built:
            return SimilarityResult(
                cases=[], n_total=0, n_similar=0,
                win_rate=None, avg_pnl=None,
                regime_distribution={}, confidence="low",
            )

        # Encode and normalize the query vector
        X_q = encode_features_df(features_df.iloc[[-1]])
        q = (X_q[0] - self._mean) / self._std
        q = np.clip(q, -5.0, 5.0)
        q_norm = np.linalg.norm(q)
        if q_norm < 1e-10:
            q_norm = 1.0
        q_unit = q / q_norm

        # Cosine similarity = dot product of unit vectors
        sims = self._X @ q_unit  # shape (N,)

        # Get top-K above threshold
        mask = sims >= min_similarity
        valid_indices = np.where(mask)[0]

        if len(valid_indices) == 0:
            # Relax threshold and get top-K anyway
            top_indices = np.argsort(sims)[::-1][:top_k]
        else:
            # Sort valid by similarity descending, take top-K
            sorted_valid = valid_indices[np.argsort(sims[valid_indices])[::-1]]
            top_indices = sorted_valid[:top_k]

        # Build result cases
        cases: list[SimilarCase] = []
        regime_counts: dict[str, int] = {}
        wins = 0
        losses = 0
        pnl_sum = 0.0
        pnl_count = 0

        for idx in top_indices:
            sim_val = float(sims[idx])
            label = self._labels[idx]
            pnl = self._pnls[idx]
            regime = str(self._regimes[idx])

            outcome = int(label) if not np.isnan(label) else None
            pnl_val = float(pnl) if not np.isnan(pnl) else None

            # Extract top-3 features that differ most from mean (for explainability)
            raw = self._X[idx] * (self._std if self._std is not None else 1.0)
            top_feat_idx = np.argsort(np.abs(raw))[::-1][:3]
            feat_dict = {FEATURE_NAMES[fi]: round(float(raw[fi]), 4) for fi in top_feat_idx}

            cases.append(SimilarCase(
                timestamp=self._index[idx],
                similarity=sim_val,
                features=feat_dict,
                outcome=outcome,
                pnl_pct=pnl_val,
                regime=regime,
            ))

            regime_counts[regime] = regime_counts.get(regime, 0) + 1
            if outcome == 1:
                wins += 1
            elif outcome == 0:
                losses += 1
            if pnl_val is not None:
                pnl_sum += pnl_val
                pnl_count += 1

        labelled = wins + losses
        win_rate = wins / labelled if labelled > 0 else None
        avg_pnl = pnl_sum / pnl_count if pnl_count > 0 else None

        # Confidence: high if ≥20 labelled cases with clear win rate
        if labelled >= 20 and win_rate is not None and abs(win_rate - 0.5) > 0.10:
            confidence = "high"
        elif labelled >= 10:
            confidence = "medium"
        else:
            confidence = "low"

        n_above_threshold = int(mask.sum())

        return SimilarityResult(
            cases=cases,
            n_total=self._n,
            n_similar=n_above_threshold,
            win_rate=win_rate,
            avg_pnl=avg_pnl,
            regime_distribution=regime_counts,
            confidence=confidence,
        )


# Module-level singleton index
_global_index: Optional[SimilarityIndex] = None


def get_similarity_index() -> SimilarityIndex:
    """Return the global similarity index (lazily created)."""
    global _global_index
    if _global_index is None:
        _global_index = SimilarityIndex()
    return _global_index
