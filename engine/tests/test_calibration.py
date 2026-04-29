"""Tests for IsotonicCalibrator — W-0313 Phase 1."""
from __future__ import annotations

import numpy as np
import pytest

from scoring.calibration import IsotonicCalibrator, _compute_ece


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_uncalibrated(n: int = 500, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    """Return (scores, labels) where scores are systematically miscalibrated."""
    rng = np.random.default_rng(seed)
    # True probabilities uniform [0.1, 0.9]
    true_p = rng.uniform(0.1, 0.9, n)
    labels = rng.binomial(1, true_p).astype(float)
    # Scores skewed toward 0.5 — miscalibrated
    scores = np.clip(true_p * 0.5 + 0.25 + rng.normal(0, 0.05, n), 0.0, 1.0)
    return scores, labels


# ── Tests ────────────────────────────────────────────────────────────────────

def test_isotonic_reduces_ece():
    scores, labels = _make_uncalibrated(500)
    cal = IsotonicCalibrator()
    cal.fit(scores, labels)
    assert cal.ece_after < cal.ece_before, (
        f"ECE_after={cal.ece_after:.4f} should be < ECE_before={cal.ece_before:.4f}"
    )


def test_ece_below_threshold():
    rng = np.random.default_rng(42)
    scores = rng.uniform(0.1, 0.9, 200)
    labels = rng.binomial(1, scores).astype(float)
    cal = IsotonicCalibrator()
    cal.fit(scores, labels)
    assert cal.ece_after < 0.1, f"ECE_after={cal.ece_after:.4f} should be < 0.1"


def test_brier_not_worse():
    scores, labels = _make_uncalibrated(500)
    cal = IsotonicCalibrator()
    cal.fit(scores, labels)
    assert cal.brier_after <= cal.brier_before + 0.001, (
        f"Brier_after={cal.brier_after:.4f} > Brier_before={cal.brier_before:.4f} + 0.001"
    )


def test_calibrator_save_load_roundtrip(tmp_path):
    scores, labels = _make_uncalibrated(200)
    cal = IsotonicCalibrator()
    cal.fit(scores, labels)

    path = tmp_path / "cal.pkl"
    cal.save(path)

    loaded = IsotonicCalibrator.load(path)
    original_out = cal.transform(scores[:10])
    loaded_out = loaded.transform(scores[:10])
    np.testing.assert_allclose(original_out, loaded_out, rtol=1e-6)

    # JSON sidecar should exist
    assert path.with_suffix(".json").exists()


def test_calibrator_identity_before_fit():
    cal = IsotonicCalibrator()
    val = 0.7
    assert cal.transform(val) == val

    arr = np.array([0.1, 0.5, 0.9])
    result = cal.transform(arr)
    np.testing.assert_array_equal(result, arr)


def test_calibrator_clip_out_of_bounds():
    rng = np.random.default_rng(42)
    scores = rng.uniform(0.1, 0.9, 100)
    labels = rng.binomial(1, scores).astype(float)
    cal = IsotonicCalibrator()
    cal.fit(scores, labels)

    # out-of-bounds inputs should not produce values outside [0, 1]
    out_of_bounds = np.array([-0.1, 1.1])
    result = cal.transform(out_of_bounds)
    assert result.min() >= 0.0
    assert result.max() <= 1.0


def test_reliability_diagram_shape():
    scores, labels = _make_uncalibrated(300)
    cal = IsotonicCalibrator()
    cal.fit(scores, labels)

    diag = cal.reliability_diagram()
    assert set(diag.keys()) >= {"bins", "acc", "conf", "count"}
    n = len(diag["bins"])
    assert n > 0
    assert len(diag["acc"]) == n
    assert len(diag["conf"]) == n
    assert len(diag["count"]) == n


def test_min_30_samples_required():
    rng = np.random.default_rng(42)
    scores = rng.uniform(0, 1, 20)
    labels = rng.binomial(1, 0.5, 20).astype(float)
    cal = IsotonicCalibrator()
    with pytest.raises(ValueError, match="30"):
        cal.fit(scores, labels)


def test_monotone_increasing_invariant():
    scores, labels = _make_uncalibrated(500)
    cal = IsotonicCalibrator()
    cal.fit(scores, labels)

    test_scores = np.linspace(0.0, 1.0, 100)
    transformed = cal.transform(test_scores)
    # monotone non-decreasing
    diffs = np.diff(transformed)
    assert np.all(diffs >= -1e-9), f"Non-monotone at indices: {np.where(diffs < -1e-9)}"
