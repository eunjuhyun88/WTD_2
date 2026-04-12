"""Tests for backtest.calibration — 3 cases per §6.10."""
from __future__ import annotations

import pytest

from backtest.calibration import compute_calibration, expected_calibration_error


# ---------------------------------------------------------------------------
# 1. Perfectly calibrated → |delta| < epsilon in all populated bins
# ---------------------------------------------------------------------------


def test_perfectly_calibrated_low_ece():
    # For each of 1000 trades with prob p, outcome is True with exact
    # frequency p. We construct this deterministically using int splits.
    probs: list[float] = []
    wins: list[bool] = []
    for bin_idx in range(10):
        p = bin_idx * 0.1 + 0.05
        n = 100
        n_wins = round(n * p)
        for _ in range(n_wins):
            probs.append(p)
            wins.append(True)
        for _ in range(n - n_wins):
            probs.append(p)
            wins.append(False)

    bins = compute_calibration(probs, wins, n_bins=10)
    ece = expected_calibration_error(bins)
    # Rounding per bin costs <= 0.005, count-weighted ECE ≤ ~0.005.
    assert ece < 0.01
    for b in bins:
        if b.count > 0:
            assert abs(b.delta) < 0.02


# ---------------------------------------------------------------------------
# 2. Over-confident model → delta < 0 in the top bin
# ---------------------------------------------------------------------------


def test_over_confident_top_bin_has_negative_delta():
    # Predicted 0.9 for 200 trades, actual win rate 0.5
    probs = [0.9] * 200
    wins = [True] * 100 + [False] * 100
    bins = compute_calibration(probs, wins, n_bins=10)
    top = bins[-1]
    assert top.count == 200
    # mean_pred ≈ 0.9, mean_actual = 0.5, delta = -0.4
    assert top.delta < -0.3


# ---------------------------------------------------------------------------
# 3. Under-confident model → delta > 0 in the top bin
# ---------------------------------------------------------------------------


def test_under_confident_top_bin_has_positive_delta():
    # Predicted 0.65 for 200 trades, actual win rate 0.95.
    # 0.65 lands unambiguously in bin index 6 ([0.6, 0.7)).
    probs = [0.65] * 200
    wins = [True] * 190 + [False] * 10
    bins = compute_calibration(probs, wins, n_bins=10)
    bin_6 = bins[6]
    assert bin_6.count == 200
    assert bin_6.delta > 0.25


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


def test_length_mismatch_raises():
    with pytest.raises(ValueError, match="length mismatch"):
        compute_calibration([0.5, 0.6], [True], n_bins=10)


def test_zero_bins_raises():
    with pytest.raises(ValueError, match="n_bins"):
        compute_calibration([0.5], [True], n_bins=0)
