"""Tests for scoring.auto_trainer — W-0394 PR2.

All tests run without Supabase or GCS (graceful degradation).
"""
from __future__ import annotations

import os
import numpy as np
import pytest


# ─── evaluate_trigger ─────────────────────────────────────────────────────────

def test_trigger_at_threshold():
    from scoring.auto_trainer import evaluate_trigger
    assert evaluate_trigger(50) is True


def test_trigger_doubling_thresholds():
    from scoring.auto_trainer import evaluate_trigger
    for n in (50, 100, 200, 400, 800):
        assert evaluate_trigger(n) is True, f"should trigger at n={n}"


def test_trigger_below_threshold():
    from scoring.auto_trainer import evaluate_trigger
    assert evaluate_trigger(49) is False
    assert evaluate_trigger(0) is False


def test_trigger_non_threshold():
    from scoring.auto_trainer import evaluate_trigger
    assert evaluate_trigger(75) is False
    assert evaluate_trigger(150) is False
    assert evaluate_trigger(999) is False


# ─── count_labelled_verdicts ───────────────────────────────────────────────────

def test_count_returns_zero_without_supabase(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    from scoring.auto_trainer import count_labelled_verdicts
    assert count_labelled_verdicts() == 0


# ─── train_and_register ───────────────────────────────────────────────────────

def test_train_returns_none_without_supabase(monkeypatch):
    """train_and_register returns None when Supabase not configured."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    from scoring.auto_trainer import train_and_register
    result = train_and_register()
    assert result is None


def test_train_respects_lock():
    """If the lock is held, train_and_register returns None immediately."""
    from scoring.auto_trainer import _TRAIN_LOCK, train_and_register
    acquired = _TRAIN_LOCK.acquire(blocking=False)
    try:
        assert acquired, "lock should be free at test start"
        result = train_and_register()
        assert result is None, "should return None when lock is already held"
    finally:
        if acquired:
            _TRAIN_LOCK.release()


# ─── shadow_eval ──────────────────────────────────────────────────────────────

def test_shadow_eval_none_on_missing_model():
    from scoring.auto_trainer import shadow_eval
    result = shadow_eval("fake-version-id", {"X_test": np.array([[1.0]]), "y_test": np.array([1])})
    assert result is None  # _trained_model missing → None


def test_shadow_eval_none_on_small_test_set():
    """Test set < 10 samples → skip eval."""
    from scoring.auto_trainer import shadow_eval

    class _FakeModel:
        def predict_proba(self, X):
            return np.column_stack([1 - X[:, 0], X[:, 0]])

    meta = {
        "X_test": np.array([[0.8]] * 5),
        "y_test": np.array([1, 0, 1, 0, 1]),
        "_trained_model": _FakeModel(),
    }
    result = shadow_eval("fake-id", meta)
    assert result is None


def test_shadow_eval_returns_metrics(monkeypatch):
    """shadow_eval returns ndcg/map/ci_lower with a working fake model."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    from scoring.auto_trainer import shadow_eval

    rng = np.random.default_rng(42)
    n = 30
    X_test = rng.random((n, 2))
    y_test = rng.integers(0, 2, size=n)

    class _FakeModel:
        def predict_proba(self, X):
            scores = X[:, 0]
            return np.column_stack([1 - scores, scores])

    meta = {
        "X_test": X_test,
        "y_test": y_test,
        "_trained_model": _FakeModel(),
    }
    result = shadow_eval("fake-id", meta)
    assert result is not None
    assert 0.0 <= result["ndcg_at_5"] <= 1.0
    assert 0.0 <= result["map_at_10"] <= 1.0
    assert isinstance(result["ci_lower"], float)


# ─── promote_if_eligible ──────────────────────────────────────────────────────

def test_promote_skips_below_threshold(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    from scoring.auto_trainer import promote_if_eligible
    result = promote_if_eligible("fake-id", {"ci_lower": 0.03})
    assert result is False


def test_promote_succeeds_above_threshold(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    from scoring.auto_trainer import promote_if_eligible
    result = promote_if_eligible("fake-id", {"ci_lower": 0.10})
    assert result is True
    assert os.environ.get("LGBM_CONTEXT_SCORE_WEIGHT") == "0.25"


# ─── run_auto_train_pipeline ──────────────────────────────────────────────────

def test_pipeline_returns_skipped_without_data(monkeypatch):
    """Full pipeline returns 'skipped' when no Supabase data."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    from scoring.auto_trainer import run_auto_train_pipeline
    result = run_auto_train_pipeline()
    assert result["status"] == "skipped"
