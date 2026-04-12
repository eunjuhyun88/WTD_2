"""Reliability diagram for classifier probabilities.

Given a list of ``(predicted_prob, actual_win)`` pairs, we bucket into
``n_bins`` equal-width bins over ``[0, 1]`` and compute:

* ``mean_pred``  — mean predicted probability in the bin
* ``mean_actual``— observed win rate in the bin
* ``delta``     — ``mean_actual - mean_pred``
* ``count``     — number of trades in the bin

A perfectly calibrated classifier has ``|delta| < epsilon`` for every
populated bin; an over-confident model has negative ``delta`` in the
high bins (predicts 80% win, actually 60%).

This is a pure function. Plot rendering is out of scope for D12 — a
text report is enough for the Stage 1 gate.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np


@dataclass(frozen=True)
class CalibrationBin:
    lo: float
    hi: float
    count: int
    mean_pred: float
    mean_actual: float
    delta: float  # actual - pred (positive = under-confident)


def compute_calibration(
    predicted_probs: Sequence[float],
    actual_wins: Sequence[bool],
    n_bins: int = 10,
) -> list[CalibrationBin]:
    """Return one ``CalibrationBin`` per bucket (including empty ones).

    Args:
        predicted_probs: classifier output, values in ``[0, 1]``.
        actual_wins: same length as ``predicted_probs``; ``True`` if the
            trade realised a positive return, ``False`` otherwise.
        n_bins: number of equal-width bins. Defaults to 10.

    Raises:
        ValueError: if input lengths differ or ``n_bins < 1``.
    """
    if n_bins < 1:
        raise ValueError("n_bins must be >= 1")
    if len(predicted_probs) != len(actual_wins):
        raise ValueError(
            f"length mismatch: {len(predicted_probs)} predictions vs "
            f"{len(actual_wins)} labels"
        )

    probs = np.asarray(predicted_probs, dtype=float)
    wins = np.asarray(actual_wins, dtype=bool)

    edges = np.linspace(0.0, 1.0, n_bins + 1)
    bins: list[CalibrationBin] = []
    for i in range(n_bins):
        lo, hi = float(edges[i]), float(edges[i + 1])
        # Right-inclusive on the final bin so prob==1.0 lands somewhere.
        if i < n_bins - 1:
            mask = (probs >= lo) & (probs < hi)
        else:
            mask = (probs >= lo) & (probs <= hi)
        n = int(mask.sum())
        if n == 0:
            bins.append(
                CalibrationBin(
                    lo=lo,
                    hi=hi,
                    count=0,
                    mean_pred=float("nan"),
                    mean_actual=float("nan"),
                    delta=float("nan"),
                )
            )
            continue
        mp = float(probs[mask].mean())
        ma = float(wins[mask].mean())
        bins.append(
            CalibrationBin(
                lo=lo,
                hi=hi,
                count=n,
                mean_pred=mp,
                mean_actual=ma,
                delta=ma - mp,
            )
        )
    return bins


def expected_calibration_error(bins: list[CalibrationBin]) -> float:
    """Return the ECE across populated bins (count-weighted mean |delta|)."""
    total = sum(b.count for b in bins)
    if total == 0:
        return 0.0
    acc = 0.0
    for b in bins:
        if b.count == 0:
            continue
        acc += (b.count / total) * abs(b.delta)
    return float(acc)
