from __future__ import annotations

from research.state_store import ResearchStateStore
from research.train_handoff import execute_train_candidate_handoff


def test_execute_train_candidate_handoff_updates_research_run(tmp_path, monkeypatch) -> None:
    store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    run = store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="obj-train-candidate",
        baseline_ref="pattern-shadow:rule-first",
        search_policy={"mode": "bounded-walk-forward-eval"},
        evaluation_protocol={"kind": "walk-forward"},
        created_at="2026-04-16T14:00:00+00:00",
        definition_ref={"definition_id": "tradoor-oi-reversal-v1:v1", "pattern_slug": "tradoor-oi-reversal-v1"},
    )
    store.start_run(run.research_run_id, started_at="2026-04-16T14:00:01+00:00")
    completed = store.complete_run(
        run.research_run_id,
        completed_at="2026-04-16T14:05:00+00:00",
        disposition="train_candidate",
        winner_variant_ref="pattern-model:tradoor-oi-reversal-v1:v1:1h:breakout:fs1:lp1",
        handoff_payload={
            "baseline_ref": "family:tradoor-oi-reversal-v1__reset-reclaim-compression",
            "baseline_family_ref": "family:tradoor-oi-reversal-v1__reset-reclaim-compression",
            "target_name": "breakout",
            "feature_schema_version": 1,
            "label_policy_version": 1,
            "threshold_policy_version": 1,
        },
    )

    monkeypatch.setattr(
        "research.train_handoff.train_pattern_model_from_ledger",
        lambda slug, **kwargs: {
            "ok": True,
            "pattern_slug": slug,
            "definition_ref": kwargs["definition_ref"],
            "model_key": "tradoor-oi-reversal-v1:v1:1h:breakout:fs1:lp1",
            "model_version": "20260416_140500",
            "rollout_state": "candidate",
            "replaced": True,
            "training_run_recorded": True,
            "model_recorded": True,
            "auc": 0.67,
            "n_records": 24,
            "n_wins": 8,
            "n_losses": 16,
        },
    )

    updated_run, result = execute_train_candidate_handoff(completed.research_run_id, store=store)

    assert result["model_version"] == "20260416_140500"
    assert updated_run.handoff_payload["training_result"]["auc"] == 0.67
    assert updated_run.handoff_payload["training_result"]["rollout_state"] == "candidate"
    assert updated_run.handoff_payload["training_result"]["baseline_ref"] == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"
    assert updated_run.handoff_payload["training_result"]["baseline_family_ref"] == "family:tradoor-oi-reversal-v1__reset-reclaim-compression"
    assert updated_run.handoff_payload["training_result"]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"


def test_execute_train_candidate_handoff_rejects_non_candidate_runs(tmp_path) -> None:
    store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    run = store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="obj-no-op",
        baseline_ref="pattern-shadow:rule-first",
        search_policy={"mode": "bounded-walk-forward-eval"},
        evaluation_protocol={"kind": "walk-forward"},
        created_at="2026-04-16T15:00:00+00:00",
    )
    store.complete_run(
        run.research_run_id,
        completed_at="2026-04-16T15:00:05+00:00",
        disposition="no_op",
    )

    try:
        execute_train_candidate_handoff(run.research_run_id, store=store)
    except ValueError as exc:
        assert "not eligible" in str(exc)
    else:
        raise AssertionError("expected ValueError")
