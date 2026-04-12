"""Inference wrapper: load a trained LightGBM model and score feature rows.

Usage:
    scorer = LGBMScorer.from_file("models_store/lgbm_BTCUSDT_long_12h.pkl")
    prob_series = scorer.score(features_df)      # pd.Series[float] per row
    p = scorer.score_latest(features_df)         # float — last bar only

The scorer converts features_df to the float64 matrix internally using
scoring.feature_matrix.encode_features_df so callers don't need to
pre-encode.
"""
from __future__ import annotations

import pickle
from pathlib import Path

import pandas as pd

from scoring.feature_matrix import encode_features_df


class LGBMScorer:
    """Wraps a trained LGBMClassifier for batch or single-bar inference."""

    def __init__(self, model: object, *, direction: str = "long", horizon_bars: int = 12) -> None:
        self._model = model
        self.direction = direction
        self.horizon_bars = horizon_bars

    # ------------------------------------------------------------------ #
    # Persistence                                                          #
    # ------------------------------------------------------------------ #

    def save(self, path: str | Path) -> None:
        """Pickle the scorer (model + metadata) to disk."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "model": self._model,
            "direction": self.direction,
            "horizon_bars": self.horizon_bars,
        }
        with open(path, "wb") as f:
            pickle.dump(payload, f)
        print(f"  Saved scorer → {path}")

    @classmethod
    def from_file(cls, path: str | Path) -> "LGBMScorer":
        """Load a scorer saved with .save()."""
        with open(path, "rb") as f:
            payload = pickle.load(f)
        return cls(
            model=payload["model"],
            direction=payload.get("direction", "long"),
            horizon_bars=payload.get("horizon_bars", 12),
        )

    # ------------------------------------------------------------------ #
    # Scoring                                                              #
    # ------------------------------------------------------------------ #

    def score(self, features_df: pd.DataFrame) -> pd.Series:
        """Score all rows in features_df.

        Returns:
            pd.Series of float probabilities in [0, 1],
            index = features_df.index, name = "prob_win".
        """
        X = encode_features_df(features_df)
        proba = self._model.predict_proba(X)[:, 1]
        return pd.Series(proba, index=features_df.index, name="prob_win", dtype=float)

    def score_latest(self, features_df: pd.DataFrame) -> float:
        """Return probability for the most recent bar only (fast path)."""
        return float(self.score(features_df.iloc[[-1]]).iloc[0])
