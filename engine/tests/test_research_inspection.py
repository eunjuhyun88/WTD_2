from __future__ import annotations

from research.inspection import (
    get_pattern_summary_view,
    get_run_detail_view,
    list_recent_runs_view,
)
from research.state_store import ResearchStateStore


def test_inspection_views_include_operator_and_control_state(tmp_path) -> None:
    store = ResearchStateStore(tmp_path / "research_runtime.sqlite")
    run = store.create_run(
        pattern_slug="tradoor-oi-reversal-v1",
        objective_id="obj-train-candidate",
        baseline_ref="pattern-shadow:rule-first",
        search_policy={"mode": "bounded-walk-forward-eval"},
        evaluation_protocol={"kind": "walk-forward"},
        created_at="2026-04-16T19:00:00+00:00",
    )
    store.complete_run(
        run.research_run_id,
        completed_at="2026-04-16T19:10:00+00:00",
        disposition="train_candidate",
        handoff_payload={"report_path": "/tmp/run.md"},
    )
    store.record_selection_decision(
        research_run_id=run.research_run_id,
        selected_variant_ref="variant-1",
        decision_kind="train_candidate",
        rationale="Gate cleared.",
        baseline_ref="pattern-shadow:rule-first",
        metrics={"eval": {"mean_auc": 0.62, "std_auc": 0.07}},
        decided_at="2026-04-16T19:09:00+00:00",
    )
    store.record_operator_decision(
        research_run_id=run.research_run_id,
        decision="defer",
        decided_by="cto",
        rationale="Need one more review.",
        decided_at="2026-04-16T19:11:00+00:00",
    )
    store.upsert_pattern_control_state(
        "tradoor-oi-reversal-v1",
        updated_at="2026-04-16T19:12:00+00:00",
        paused_by_operator=True,
    )

    recent = list_recent_runs_view(store=store)
    detail = get_run_detail_view(run.research_run_id, store=store)
    summary = get_pattern_summary_view("tradoor-oi-reversal-v1", store=store)

    assert recent[0]["approval_decision"] == "defer"
    assert detail["operator_decision"]["decision"] == "defer"
    assert detail["pattern_control_state"]["paused_by_operator"] is True
    assert summary["control_state"]["paused_by_operator"] is True
    assert summary["recent_train_candidate_count"] == 1
