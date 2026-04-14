"""Tests for scoring.trainer — walk-forward retraining."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

# lightgbm may be importable but fail native load (e.g. missing libomp on macOS).
try:
    import lightgbm  # noqa: F401
except Exception as exc:  # pragma: no cover - environment-specific skip
    pytest.skip(f"lightgbm unavailable in current environment: {exc}", allow_module_level=True)

pytest.importorskip("sklearn", reason="scikit-learn not installed")

from scoring.trainer import train, train_walkforward, WalkForwardResult
from scoring.feature_matrix import FEATURE_NAMES


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_xy(n: int = 6_000, n_features: int = 39, seed: int = 0):
    """Synthetic float64 feature matrix and binary labels."""
    rng = np.random.default_rng(seed)
    X = rng.standard_normal((n, n_features)).astype(np.float64)
    y = rng.integers(0, 2, size=n).astype(np.int8)
    idx = pd.date_range("2020-01-01", periods=n, freq="1h", tz="UTC")
    feature_names = [f"f{i}" for i in range(n_features)]
    return X, y, idx, feature_names


# ── train() ──────────────────────────────────────────────────────────────────

def test_train_returns_model_and_report():
    X, y, _, fnames = _make_xy(2000)
    model, report = train(X, y, fnames, n_splits=3)
    assert model is not None
    assert 0.0 <= report.cv_auc_mean <= 1.0
    assert len(report.cv_auc_scores) == 3


def test_train_feature_importance_shape():
    X, y, _, fnames = _make_xy(2000)
    _, report = train(X, y, fnames, n_splits=2)
    assert len(report.feature_importance) == len(fnames)
    assert "feature" in report.feature_importance.columns
    assert "gain" in report.feature_importance.columns


# ── train_walkforward() ───────────────────────────────────────────────────────

def test_walkforward_returns_result():
    X, y, idx, fnames = _make_xy(6_000)
    wf = train_walkforward(
        X, y, idx, fnames,
        min_train_bars=2000,
        step_bars=1000,
    )
    assert isinstance(wf, WalkForwardResult)
    assert wf.n_periods > 0
    assert 0.0 <= wf.oos_auc <= 1.0


def test_walkforward_oos_coverage():
    """OOS prob series should cover at least (n - min_train_bars) rows."""
    n = 6_000
    min_train = 2_000
    X, y, idx, fnames = _make_xy(n)
    wf = train_walkforward(X, y, idx, fnames, min_train_bars=min_train, step_bars=1000)
    assert len(wf.oos_prob) >= n - min_train - 1


def test_walkforward_oos_prob_in_unit_interval():
    X, y, idx, fnames = _make_xy(6_000)
    wf = train_walkforward(X, y, idx, fnames, min_train_bars=2000, step_bars=1000)
    assert wf.oos_prob.between(0.0, 1.0).all()


def test_walkforward_period_count():
    """Number of periods = ceil((n - min_train) / step)."""
    n, min_train, step = 6_000, 2_000, 1_000
    X, y, idx, fnames = _make_xy(n)
    wf = train_walkforward(X, y, idx, fnames, min_train_bars=min_train, step_bars=step)
    expected = (n - min_train + step - 1) // step
    assert abs(wf.n_periods - expected) <= 1  # ±1 allowed for label edge trimming


def test_walkforward_final_model_not_none():
    X, y, idx, fnames = _make_xy(6_000)
    wf = train_walkforward(X, y, idx, fnames, min_train_bars=2000, step_bars=1000)
    assert wf.final_model is not None
    # Final model should be able to score a batch of rows.
    proba = wf.final_model.predict_proba(X[:5])
    assert proba.shape == (5, 2)


def test_walkforward_raises_if_too_few_samples():
    X, y, idx, fnames = _make_xy(500)
    with pytest.raises(ValueError, match="Not enough samples"):
        train_walkforward(X, y, idx, fnames, min_train_bars=400, step_bars=200)


def test_walkforward_str_repr():
    X, y, idx, fnames = _make_xy(6_000)
    wf = train_walkforward(X, y, idx, fnames, min_train_bars=2000, step_bars=1000)
    s = str(wf)
    assert "Walk-forward periods" in s
    assert "OOS AUC" in s
