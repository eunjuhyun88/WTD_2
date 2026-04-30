"""W-0358: scanner ML inference tests.

AC1: registry model → predicted_prob != 0.6, model_source="registry"
AC2: no registry model → model_source="fallback", predicted_prob=0.6
AC3: predict_feature_row returns None → fallback
AC4: resolve_threshold policy versions (1→0.55, 2→0.60, 3→0.50, None→0.55)
AC5: _predict_safe never raises
AC6: _AUTO_PROMOTE_MIN_AUC=0.65 (0.62 → no promote, 0.66 → promote)
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


# ── AC4: resolve_threshold ────────────────────────────────────────────────────

def test_resolve_threshold_policy_v1():
    from patterns.model_registry import resolve_threshold
    assert resolve_threshold(1) == 0.55


def test_resolve_threshold_policy_v2():
    from patterns.model_registry import resolve_threshold
    assert resolve_threshold(2) == 0.60


def test_resolve_threshold_policy_v3():
    from patterns.model_registry import resolve_threshold
    assert resolve_threshold(3) == 0.50


def test_resolve_threshold_none_uses_default():
    from patterns.model_registry import resolve_threshold
    assert resolve_threshold(None) == 0.55


def test_resolve_threshold_unknown_version_falls_back_to_default():
    from patterns.model_registry import resolve_threshold
    assert resolve_threshold(99) == 0.55


def test_resolve_threshold_custom_default():
    from patterns.model_registry import resolve_threshold
    assert resolve_threshold(None, default=0.70) == 0.70


# ── AC2: no registry model → fallback ────────────────────────────────────────

def test_predict_safe_no_registry_returns_fallback():
    from research.pattern_scan.scanner import _predict_safe, _FALLBACK_PROB, _FALLBACK_THRESHOLD

    with patch("research.pattern_scan.scanner.MODEL_REGISTRY_STORE") as mock_registry:
        mock_registry.get_preferred_scoring_model.return_value = None
        prob, threshold, source = _predict_safe("no_such_pattern", {"close": 1.0})

    assert prob == _FALLBACK_PROB
    assert threshold == _FALLBACK_THRESHOLD
    assert source == "fallback"


# ── AC1: registry model → real ML score ──────────────────────────────────────

def test_predict_safe_registry_model_returns_ml_score():
    from research.pattern_scan.scanner import _predict_safe

    mock_entry = MagicMock()
    mock_entry.model_key = "test_model_key"
    mock_entry.threshold_policy_version = 1

    mock_engine = MagicMock()
    mock_engine.predict_feature_row.return_value = 0.73

    with (
        patch("research.pattern_scan.scanner.MODEL_REGISTRY_STORE") as mock_registry,
        patch("research.pattern_scan.scanner.get_engine", return_value=mock_engine),
        patch("research.pattern_scan.scanner._current_definition_id", return_value="slug:v1"),
    ):
        mock_registry.get_preferred_scoring_model.return_value = mock_entry
        prob, threshold, source = _predict_safe("my_pattern", {"close": 100.0})

    assert prob != 0.6
    assert abs(prob - 0.73) < 1e-9
    assert threshold == 0.55  # policy_version=1
    assert source == "registry"


def test_predict_safe_registry_uses_policy_version():
    from research.pattern_scan.scanner import _predict_safe

    mock_entry = MagicMock()
    mock_entry.model_key = "test_model_key"
    mock_entry.threshold_policy_version = 2  # strict → 0.60

    mock_engine = MagicMock()
    mock_engine.predict_feature_row.return_value = 0.82

    with (
        patch("research.pattern_scan.scanner.MODEL_REGISTRY_STORE") as mock_registry,
        patch("research.pattern_scan.scanner.get_engine", return_value=mock_engine),
        patch("research.pattern_scan.scanner._current_definition_id", return_value=None),
    ):
        mock_registry.get_preferred_scoring_model.return_value = mock_entry
        prob, threshold, source = _predict_safe("strict_pattern", {})

    assert threshold == 0.60
    assert source == "registry"


# ── AC3: predict_feature_row returns None → fallback ─────────────────────────

def test_predict_safe_untrained_engine_returns_fallback():
    from research.pattern_scan.scanner import _predict_safe, _FALLBACK_PROB, _FALLBACK_THRESHOLD

    mock_entry = MagicMock()
    mock_entry.model_key = "untrained_key"
    mock_entry.threshold_policy_version = 1

    mock_engine = MagicMock()
    mock_engine.predict_feature_row.return_value = None  # not yet trained

    with (
        patch("research.pattern_scan.scanner.MODEL_REGISTRY_STORE") as mock_registry,
        patch("research.pattern_scan.scanner.get_engine", return_value=mock_engine),
        patch("research.pattern_scan.scanner._current_definition_id", return_value=None),
    ):
        mock_registry.get_preferred_scoring_model.return_value = mock_entry
        prob, threshold, source = _predict_safe("untrained_pattern", {})

    assert prob == _FALLBACK_PROB
    assert threshold == _FALLBACK_THRESHOLD
    assert source == "fallback"


# ── AC5: _predict_safe never raises ──────────────────────────────────────────

def test_predict_safe_swallows_registry_exception():
    from research.pattern_scan.scanner import _predict_safe, _FALLBACK_PROB, _FALLBACK_THRESHOLD

    with patch("research.pattern_scan.scanner.MODEL_REGISTRY_STORE") as mock_registry:
        mock_registry.get_preferred_scoring_model.side_effect = RuntimeError("db down")
        prob, threshold, source = _predict_safe("any_pattern", {"x": 1})

    assert prob == _FALLBACK_PROB
    assert threshold == _FALLBACK_THRESHOLD
    assert source == "fallback"


def test_predict_safe_swallows_engine_exception():
    from research.pattern_scan.scanner import _predict_safe, _FALLBACK_PROB, _FALLBACK_THRESHOLD

    mock_entry = MagicMock()
    mock_entry.model_key = "boom"
    mock_entry.threshold_policy_version = 1

    mock_engine = MagicMock()
    mock_engine.predict_feature_row.side_effect = ValueError("shape mismatch")

    with (
        patch("research.pattern_scan.scanner.MODEL_REGISTRY_STORE") as mock_registry,
        patch("research.pattern_scan.scanner.get_engine", return_value=mock_engine),
        patch("research.pattern_scan.scanner._current_definition_id", return_value=None),
    ):
        mock_registry.get_preferred_scoring_model.return_value = mock_entry
        prob, threshold, source = _predict_safe("exploding_pattern", {})

    assert prob == _FALLBACK_PROB
    assert threshold == _FALLBACK_THRESHOLD
    assert source == "fallback"


# ── AC6: _AUTO_PROMOTE_MIN_AUC = 0.65 ────────────────────────────────────────

def test_auto_promote_min_auc_is_065():
    import patterns.training_service as ts
    assert ts._AUTO_PROMOTE_MIN_AUC == 0.65


def test_auto_promote_auc_below_threshold_does_not_promote():
    """AUC 0.62 < 0.65 → candidate stays, no promote call."""
    import patterns.training_service as ts

    mock_result = {
        "replaced": True,
        "auc": 0.62,
        "model_version": "v1",
        "fold_aucs": [0.62],
    }
    mock_engine = MagicMock()
    mock_engine.train.return_value = mock_result

    mock_registry = MagicMock()
    mock_record_store = MagicMock()
    mock_variant_store = MagicMock()
    mock_ledger = MagicMock()

    # Build enough fake records (≥ 30)
    fake_outcomes = [MagicMock() for _ in range(35)]
    mock_records = [{"feature_snapshot": {}, "label": i % 2} for i in range(35)]

    with (
        patch.object(ts, "list_outcomes_for_definition", return_value=fake_outcomes),
        patch.object(ts, "build_pattern_training_records", return_value=mock_records),
        patch.object(ts, "_pattern_training_matrix", return_value=(__import__("numpy").zeros((35, 5)), __import__("numpy").array([i % 2 for i in range(35)]))),
        patch.object(ts, "make_pattern_model_key", return_value="test_key"),
        patch.object(ts, "get_pattern") as mock_get_pattern,
    ):
        mock_pattern = MagicMock()
        mock_pattern.timeframe = "1h"
        mock_get_pattern.return_value = mock_pattern

        mock_registry.upsert_candidate.return_value = MagicMock(rollout_state="candidate")

        ts.train_pattern_model_from_ledger(
            "test_pattern",
            ledger=mock_ledger,
            record_store=mock_record_store,
            registry_store=mock_registry,
            variant_store=mock_variant_store,
            get_engine_fn=lambda _k: mock_engine,
        )

    # promote should NOT have been called
    mock_registry.promote.assert_not_called()


def test_auto_promote_auc_above_threshold_promotes():
    """AUC 0.66 >= 0.65 and records >= 30 → promote is called."""
    import patterns.training_service as ts

    mock_result = {
        "replaced": True,
        "auc": 0.66,
        "model_version": "v1",
        "fold_aucs": [0.66],
    }
    mock_engine = MagicMock()
    mock_engine.train.return_value = mock_result

    mock_registry = MagicMock()
    mock_record_store = MagicMock()
    mock_variant_store = MagicMock()
    mock_ledger = MagicMock()

    mock_records = [{"feature_snapshot": {}, "label": i % 2} for i in range(35)]

    import numpy as np

    with (
        patch.object(ts, "list_outcomes_for_definition", return_value=[MagicMock() for _ in range(35)]),
        patch.object(ts, "build_pattern_training_records", return_value=mock_records),
        patch.object(ts, "_pattern_training_matrix", return_value=(np.zeros((35, 5)), np.array([i % 2 for i in range(35)]))),
        patch.object(ts, "make_pattern_model_key", return_value="test_key"),
        patch.object(ts, "get_pattern") as mock_get_pattern,
    ):
        mock_pattern = MagicMock()
        mock_pattern.timeframe = "1h"
        mock_get_pattern.return_value = mock_pattern

        mock_registry.upsert_candidate.return_value = MagicMock(rollout_state="candidate")
        mock_registry.promote.return_value = MagicMock(rollout_state="active")

        ts.train_pattern_model_from_ledger(
            "test_pattern",
            ledger=mock_ledger,
            record_store=mock_record_store,
            registry_store=mock_registry,
            variant_store=mock_variant_store,
            get_engine_fn=lambda _k: mock_engine,
        )

    # promote SHOULD have been called once
    mock_registry.promote.assert_called_once()
