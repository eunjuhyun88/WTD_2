from __future__ import annotations

from research.reporting import write_refinement_report
from research.state_store import ResearchStateStore


def test_write_refinement_report_includes_objective_and_selection(tmp_path) -> None:
    store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    run = store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="obj-reset-train-candidate",
        baseline_ref="baseline:candidate-v1",
        search_policy={"mode": "reset-bounded-eval"},
        evaluation_protocol={"kind": "walk-forward"},
        created_at="2026-04-16T16:00:00+00:00",
        definition_ref={"definition_id": "tradoor-oi-reversal-v1:v1", "pattern_slug": "tradoor-oi-reversal-v1"},
    )
    store.start_run(run.research_run_id, started_at="2026-04-16T16:00:01+00:00")
    completed = store.complete_run(
        run.research_run_id,
        completed_at="2026-04-16T16:05:00+00:00",
        disposition="dead_end",
        winner_variant_ref="variant-19",
        handoff_payload={
            "baseline_family_ref": "family:tradoor-oi-reversal-v1__reset-reclaim-compression",
            "canonical_feature_score": 0.8125,
            "reference_canonical_feature_score": 0.84,
            "holdout_canonical_feature_score": 0.785,
            "canonical_feature_scored_case_count": 3,
            "canonical_feature_summary": {
                "oi_zscore_mean": 1.92,
                "funding_rate_zscore_mean": -1.08,
                "funding_flip_rate": 0.667,
                "volume_percentile_mean": 0.81,
                "pullback_depth_pct_mean": 0.093,
                "cvd_price_divergence_mean": -0.11,
            },
        },
    )
    store.record_selection_decision(
        research_run_id=run.research_run_id,
        selected_variant_ref="variant-19",
        decision_kind="dead_end",
        rationale="Variance gate failed.",
        baseline_ref="baseline:candidate-v1",
        metrics={"mean_auc": 0.54, "std_auc": 0.14},
        decided_at="2026-04-16T16:04:00+00:00",
    )
    store.append_memory_note(
        research_run_id=run.research_run_id,
        pattern_slug="tradoor-oi-reversal-v1",
        note_kind="dead_end",
        summary="Repeated variance failure.",
        detail="Two recent bounded runs exceeded the std gate.",
        tags=["variance"],
        created_at="2026-04-16T16:04:30+00:00",
    )

    report_path = write_refinement_report(
        completed,
        objective={
            "objective_id": "obj-reset-train-candidate",
            "objective_kind": "reset_search",
            "rationale": "Two recent dead ends triggered reset mode.",
            "baseline_ref_hint": "baseline:candidate-v1",
            "recommended_search_policy": {"policy": "reset_search", "mode": "reset-bounded-eval"},
            "recommended_evaluation_protocol": {
                "kind": "walk-forward",
                "n_splits": 6,
                "min_mean_auc": 0.57,
                "max_std_auc": 0.10,
            },
            "dataset_summary": {"ready_to_train": True},
            "history_summary": {
                "recent_dead_end_count": 2,
                "recent_best_mean_auc": 0.57,
                "recent_high_variance_count": 2,
                "plateau_detected": False,
            },
            "supporting_signals": {"recent_dead_end_count": 2, "recent_high_variance_count": 2},
        },
        store=store,
        reports_dir=tmp_path / "reports",
    )
    text = report_path.read_text()

    assert "reset_search" in text
    assert "Variance gate failed." in text
    assert "Repeated variance failure." in text
    assert "Definition Ref" in text
    assert "Mean AUC vs Gate" in text
    assert "Std AUC vs Variance Ceiling" in text
    assert "Baseline Ref" in text
    assert "Baseline Family Ref" in text
    assert "family:tradoor-oi-reversal-v1__reset-reclaim-compression" in text
    assert "Canonical Feature Score" in text
    assert "Reference Canonical Feature Score" in text
    assert "Holdout Canonical Feature Score" in text
    assert "Canonical Feature Summary" in text
    assert "Operator Recommendation" in text


def test_write_refinement_report_surfaces_scoring_drift_mode(tmp_path) -> None:
    store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    run = store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="obj-drift-review",
        baseline_ref="baseline:candidate-v1",
        search_policy={"mode": "drift-refresh-probe"},
        evaluation_protocol={"kind": "walk-forward"},
        created_at="2026-04-16T18:00:00+00:00",
    )
    completed = store.complete_run(
        run.research_run_id,
        completed_at="2026-04-16T18:05:00+00:00",
        disposition="dead_end",
    )
    store.record_selection_decision(
        research_run_id=run.research_run_id,
        selected_variant_ref=None,
        decision_kind="dead_end",
        rationale="Threshold separation weakened despite full score coverage.",
        baseline_ref="baseline:candidate-v1",
        metrics={"eval": {"mean_auc": 0.565, "std_auc": 0.08}},
        decided_at="2026-04-16T18:04:00+00:00",
    )

    report_path = write_refinement_report(
        completed,
        objective={
            "objective_id": "obj-drift-review",
            "objective_kind": "scoring_drift_review",
            "rationale": "Coverage is intact but threshold separation is weakening.",
            "baseline_ref_hint": "baseline:candidate-v1",
            "recommended_search_policy": {"policy": "local_refresh_sweep", "mode": "drift-refresh-probe"},
            "recommended_evaluation_protocol": {
                "kind": "walk-forward",
                "n_splits": 5,
                "min_mean_auc": 0.57,
                "max_std_auc": 0.09,
            },
            "dataset_summary": {"ready_to_train": True, "score_coverage": 1.0, "threshold_pass_rate": 0.0},
            "history_summary": {"recent_best_mean_auc": 0.58, "recent_high_variance_count": 0, "plateau_detected": False},
            "supporting_signals": {"scoring_drift_mode": "incremental"},
        },
        store=store,
        reports_dir=tmp_path / "reports",
    )
    text = report_path.read_text()

    assert "Scoring Drift Mode" in text
    assert "incremental" in text
    assert "bounded refresh probe" in text
