"""Isotonic calibration for LightGBM P(win) scores.

Reduces ECE (Expected Calibration Error) by wrapping sklearn IsotonicRegression.
Falls through as identity transform if not fitted (graceful degradation).
"""
from __future__ import annotations

import json
import pickle
from pathlib import Path
from typing import Union

import numpy as np


class IsotonicCalibrator:
    def __init__(self) -> None:
        self._fitted = False
        self._iso = None
        self.brier_before: float | None = None
        self.brier_after: float | None = None
        self.ece_before: float | None = None
        self.ece_after: float | None = None
        self._fit_scores: np.ndarray | None = None
        self._fit_labels: np.ndarray | None = None

    def fit(self, scores: np.ndarray, labels: np.ndarray) -> "IsotonicCalibrator":
        """Fit isotonic regression calibrator.

        Args:
            scores: Raw LightGBM predict_proba scores in [0, 1], shape (n,)
            labels: Binary labels {0, 1}, shape (n,)

        Raises:
            ValueError: if len(scores) < 30
        """
        from sklearn.isotonic import IsotonicRegression

        if len(scores) < 30:
            raise ValueError(f"Need >=30 samples for calibration, got {len(scores)}")
        scores = np.clip(scores.astype(float), 0.0, 1.0)
        labels = labels.astype(float)

        self.brier_before = float(np.mean((scores - labels) ** 2))
        self.ece_before = _compute_ece(scores, labels)

        self._iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0, increasing=True)
        self._iso.fit(scores, labels)
        self._fitted = True
        self._fit_scores = scores
        self._fit_labels = labels

        cal = self._iso.predict(scores)
        self.brier_after = float(np.mean((cal - labels) ** 2))
        self.ece_after = _compute_ece(cal, labels)
        return self

    def transform(self, scores: Union[np.ndarray, float]) -> Union[np.ndarray, float]:
        """Apply calibration. Returns identity if not fitted."""
        if not self._fitted or self._iso is None:
            return scores
        scalar = np.ndim(scores) == 0
        arr = np.atleast_1d(np.asarray(scores, dtype=float))
        out = self._iso.predict(arr)
        return float(out[0]) if scalar else out

    def ece(self) -> float:
        return self.ece_after if self.ece_after is not None else 1.0

    def reliability_diagram(self) -> dict:
        if self._fit_scores is None or self._fit_labels is None:
            return {"bins": [], "acc": [], "conf": [], "count": []}
        return _reliability_diagram(self._fit_scores, self._fit_labels, n_bins=10)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self, f)
        sidecar = path.with_suffix(".json")
        sidecar.write_text(json.dumps({
            "brier_before": self.brier_before,
            "brier_after": self.brier_after,
            "ece_before": self.ece_before,
            "ece_after": self.ece_after,
            "fitted": self._fitted,
        }, indent=2))

    @classmethod
    def load(cls, path: Path) -> "IsotonicCalibrator":
        with open(path, "rb") as f:
            return pickle.load(f)


def _compute_ece(scores: np.ndarray, labels: np.ndarray, n_bins: int = 10) -> float:
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    n = len(scores)
    for i in range(n_bins):
        mask = (scores >= bins[i]) & (scores < bins[i + 1])
        if not mask.any():
            continue
        acc = labels[mask].mean()
        conf = scores[mask].mean()
        ece += mask.sum() / n * abs(acc - conf)
    return float(ece)


def _reliability_diagram(scores: np.ndarray, labels: np.ndarray, n_bins: int = 10) -> dict:
    bins = np.linspace(0.0, 1.0, n_bins + 1)
    acc_list, conf_list, count_list, bin_list = [], [], [], []
    for i in range(n_bins):
        mask = (scores >= bins[i]) & (scores < bins[i + 1])
        if mask.any():
            acc_list.append(float(labels[mask].mean()))
            conf_list.append(float(scores[mask].mean()))
            count_list.append(int(mask.sum()))
            bin_list.append(float((bins[i] + bins[i + 1]) / 2))
    return {"bins": bin_list, "acc": acc_list, "conf": conf_list, "count": count_list}
