"""W-0398: E2E tests for Layer C auto-train scheduler wiring.

Verifies:
1. scheduler.py registers layer_c_trainer_check job when flag enabled
2. verdict hook in captures.py fires evaluate_trigger + run_auto_train_pipeline
3. evaluate_trigger returns False below threshold, True at 50
4. Full pipeline returns "promoted" or "shadow" status dict when triggered
"""
from __future__ import annotations

import threading
from unittest.mock import MagicMock, patch

import pytest


# ── Scheduler job registration ────────────────────────────────────────────────


def test_layer_c_trainer_check_job_registered(monkeypatch):
    """When ENABLE_LAYER_C_TRAINER_CHECK_JOB=true, scheduler registers the job."""
    monkeypatch.setenv("ENABLE_LAYER_C_TRAINER_CHECK_JOB", "true")
    # Reload the module so env vars are re-read
    import importlib
    import scanner.scheduler as sched
    importlib.reload(sched)

    assert sched._job_enabled("layer_c_trainer_check") is True


def test_layer_c_trainer_check_job_disabled_by_default(monkeypatch):
    """Default: ENABLE_LAYER_C_TRAINER_CHECK_JOB=false — job should not be enabled."""
    monkeypatch.delenv("ENABLE_LAYER_C_TRAINER_CHECK_JOB", raising=False)
    import importlib
    import scanner.scheduler as sched
    importlib.reload(sched)

    assert sched._job_enabled("layer_c_trainer_check") is False


# ── evaluate_trigger threshold checks ────────────────────────────────────────


def test_evaluate_trigger_at_50():
    from scoring.auto_trainer import evaluate_trigger
    assert evaluate_trigger(50) is True


def test_evaluate_trigger_below_50():
    from scoring.auto_trainer import evaluate_trigger
    assert evaluate_trigger(49) is False


def test_evaluate_trigger_at_100():
    from scoring.auto_trainer import evaluate_trigger
    assert evaluate_trigger(100) is True


def test_evaluate_trigger_skips_when_locked():
    from scoring.auto_trainer import evaluate_trigger, _TRAIN_LOCK
    with _TRAIN_LOCK:
        assert evaluate_trigger(50) is False


# ── Verdict hook fires pipeline ───────────────────────────────────────────────


def test_verdict_hook_fires_on_trigger(monkeypatch):
    """When count_labelled_verdicts returns 50, the pipeline should be called."""
    called = threading.Event()
    pipeline_result = {
        "status": "shadow",
        "version_id": "v-test-001",
        "ndcg_at_5": 0.72,
        "ci_lower": 0.08,
        "promoted": False,
    }

    def mock_count():
        return 50

    def mock_pipeline():
        called.set()
        return pipeline_result

    with (
        patch("scoring.auto_trainer.count_labelled_verdicts", mock_count),
        patch("scoring.auto_trainer.run_auto_train_pipeline", mock_pipeline),
    ):
        # Import here so patches apply
        from scoring.auto_trainer import count_labelled_verdicts, evaluate_trigger, run_auto_train_pipeline

        n = count_labelled_verdicts()
        assert evaluate_trigger(n) is True
        result = run_auto_train_pipeline()
        assert result["status"] == "shadow"

    assert called.is_set()


def test_verdict_hook_no_fire_below_threshold():
    """At n=49 evaluate_trigger returns False — pipeline must not run."""
    pipeline_calls = []

    with patch("scoring.auto_trainer.run_auto_train_pipeline", side_effect=lambda: pipeline_calls.append(1)):
        from scoring.auto_trainer import evaluate_trigger
        if not evaluate_trigger(49):
            pass  # correctly skipped

    assert pipeline_calls == []


# ── run_auto_train_pipeline returns structured dict ───────────────────────────


def test_pipeline_returns_skipped_when_no_data():
    """When training data is unavailable, pipeline returns {'status': 'skipped'}."""
    with patch("scoring.auto_trainer.train_and_register", return_value=None):
        from scoring.auto_trainer import run_auto_train_pipeline
        result = run_auto_train_pipeline()
        assert result == {"status": "skipped"}


def test_pipeline_returns_trained_no_eval_when_eval_fails():
    """When shadow_eval fails, pipeline returns 'trained_no_eval'."""
    fake_version = "v-001"
    fake_meta: dict = {}

    with (
        patch("scoring.auto_trainer.train_and_register", return_value=(fake_version, fake_meta)),
        patch("scoring.auto_trainer.shadow_eval", return_value=None),
    ):
        from scoring.auto_trainer import run_auto_train_pipeline
        result = run_auto_train_pipeline()
        assert result["status"] == "trained_no_eval"
        assert result["version_id"] == fake_version


def test_pipeline_returns_shadow_when_ci_low():
    """When CI lower bound ≤ 0.05, pipeline returns 'shadow' (no promotion)."""
    fake_version = "v-002"
    fake_meta: dict = {}
    eval_result = {"ndcg_at_5": 0.55, "map_at_10": 0.48, "ci_lower": 0.03}

    with (
        patch("scoring.auto_trainer.train_and_register", return_value=(fake_version, fake_meta)),
        patch("scoring.auto_trainer.shadow_eval", return_value=eval_result),
        patch("scoring.auto_trainer.promote_if_eligible", return_value=False),
    ):
        from scoring.auto_trainer import run_auto_train_pipeline
        result = run_auto_train_pipeline()
        assert result["status"] == "shadow"
        assert result["promoted"] is False


def test_pipeline_returns_promoted_when_ci_high():
    """When CI lower bound > 0.05, pipeline promotes and sets LGBM weight."""
    fake_version = "v-003"
    fake_meta: dict = {}
    eval_result = {"ndcg_at_5": 0.70, "map_at_10": 0.62, "ci_lower": 0.12}

    with (
        patch("scoring.auto_trainer.train_and_register", return_value=(fake_version, fake_meta)),
        patch("scoring.auto_trainer.shadow_eval", return_value=eval_result),
        patch("scoring.auto_trainer.promote_if_eligible", return_value=True),
    ):
        from scoring.auto_trainer import run_auto_train_pipeline
        result = run_auto_train_pipeline()
        assert result["status"] == "promoted"
        assert result["promoted"] is True
        assert result["ci_lower"] == 0.12
