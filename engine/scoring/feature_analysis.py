"""Feature analysis utilities for model explainability and lineage."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from models.signal import SignalSnapshot
from scoring.feature_matrix import FEATURE_NAMES, snapshot_to_vector


@dataclass(frozen=True)
class FeatureContribution:
    name: str
    value: float
    contribution: float


def approximate_feature_contribution(
    model,
    snap: SignalSnapshot,
) -> list[FeatureContribution]:
    """Approximate per-feature contributions for tree models.

    Priority:
      1) Use model native `pred_contrib=True` when available.
      2) Fall back to gain-weighted absolute feature value approximation.
    """
    x = snapshot_to_vector(snap).reshape(1, -1)
    names = list(FEATURE_NAMES)
    values = x[0]

    if hasattr(model, "booster_"):
        booster = model.booster_
        try:
            raw = booster.predict(x, pred_contrib=True)
            contrib_vec = raw[0]
            if len(contrib_vec) == len(names) + 1:
                contrib_vec = contrib_vec[:-1]
            return [
                FeatureContribution(name=names[i], value=float(values[i]), contribution=float(contrib_vec[i]))
                for i in range(min(len(names), len(contrib_vec)))
            ]
        except Exception:
            pass

    # Fallback approximation: normalize by model feature importance.
    if hasattr(model, "feature_importances_"):
        imp = np.asarray(model.feature_importances_, dtype=np.float64)
    else:
        imp = np.ones(len(names), dtype=np.float64)
    if len(imp) < len(names):
        imp = np.pad(imp, (0, len(names) - len(imp)), mode="constant", constant_values=1.0)
    elif len(imp) > len(names):
        imp = imp[: len(names)]
    if imp.sum() <= 0:
        imp = np.ones(len(names), dtype=np.float64)
    w = imp / imp.sum()
    contrib = np.abs(values) * w
    return [
        FeatureContribution(name=names[i], value=float(values[i]), contribution=float(contrib[i]))
        for i in range(len(names))
    ]


def top_feature_stability(feature_importance_history: list[dict[str, float]], top_k: int = 20) -> dict:
    """Return overlap stability of top-k features across multiple runs."""
    if len(feature_importance_history) < 2:
        return {"pairs": 0, "mean_jaccard": 1.0, "top_k": top_k}

    def _top(d: dict[str, float]) -> set[str]:
        ranked = sorted(d.items(), key=lambda kv: kv[1], reverse=True)
        return {name for name, _ in ranked[:top_k]}

    sets = [_top(d) for d in feature_importance_history]
    pairs = 0
    scores = []
    for i in range(len(sets)):
        for j in range(i + 1, len(sets)):
            a, b = sets[i], sets[j]
            union = len(a | b)
            jaccard = (len(a & b) / union) if union else 1.0
            scores.append(jaccard)
            pairs += 1

    return {
        "pairs": pairs,
        "mean_jaccard": float(np.mean(scores)) if scores else 1.0,
        "min_jaccard": float(np.min(scores)) if scores else 1.0,
        "max_jaccard": float(np.max(scores)) if scores else 1.0,
        "top_k": top_k,
    }

