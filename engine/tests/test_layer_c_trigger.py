"""Tests for Layer C auto-training trigger — W-0313 Phase 1b."""
from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

import scoring.trainer_trigger as tt
from scoring.trainer_trigger import (
    TrainingResult,
    maybe_trigger,
    reset_trigger_state,
    train_layer_c,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _reset():
    reset_trigger_state()
    yield
    reset_trigger_state()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_records(n: int, n_pos: int = None) -> list:
    rng = np.random.default_rng(42)
    if n_pos is None:
        n_pos = n // 2
    labels = np.array([1.0] * n_pos + [0.0] * (n - n_pos))
    return [{"feature_vector": rng.random(20).tolist(), "label": float(l)} for l in labels]


class MockEngine:
    _model = None
    _calibrator = None
    _auc = None

    def predict_one(self, snap):
        return None

    def train(self, X, y, **kw):
        import lightgbm as lgb
        m = lgb.LGBMClassifier(n_estimators=5, verbose=-1)
        m.fit(X, y)
        self._model = m
        self._auc = 0.6
        return {"auc": 0.6, "replaced": True, "fold_aucs": [0.6], "n_samples": len(X)}


# ── Tests ────────────────────────────────────────────────────────────────────

def test_50_verdicts_triggers_train():
    assert maybe_trigger(50) is True


def test_49_verdicts_no_trigger():
    assert maybe_trigger(49) is False


def test_imbalanced_class_skips_train():
    records = _make_records(60, n_pos=0)  # all negative
    engine = MockEngine()
    result = train_layer_c(engine, records)
    assert result.skip_reason == "class_imbalance"
    assert result.triggered is False


def test_debounce_within_1h_no_trigger():
    tt._last_train_at = datetime.now(timezone.utc)
    assert maybe_trigger(50) is False


def test_layer_c_none_before_training():
    engine = MockEngine()
    assert engine._model is None
    assert engine.predict_one(None) is None


def test_concurrent_trigger_blocked():
    tt._currently_training = True
    assert maybe_trigger(50) is False


def test_train_failure_preserves_incumbent():
    class FailingEngine:
        _model = None
        _calibrator = None

        def train(self, X, y, **kw):
            raise ValueError("Simulated training failure")

    records = _make_records(60)
    engine = FailingEngine()
    with pytest.raises(ValueError, match="Simulated"):
        train_layer_c(engine, records)
    # incumbent model is still None (not changed)
    assert engine._model is None


def test_reset_clears_debounce():
    tt._last_train_at = datetime.now(timezone.utc)
    reset_trigger_state()
    assert tt._last_train_at is None
    assert tt._currently_training is False


def test_insufficient_records_returns_skip():
    records = _make_records(10)
    engine = MockEngine()
    result = train_layer_c(engine, records)
    assert result.skip_reason == "insufficient_verdicts"
    assert result.triggered is False
    assert result.n_verdicts == 10
