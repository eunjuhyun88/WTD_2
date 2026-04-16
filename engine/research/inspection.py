"""Read-only inspection helpers for the refinement operator control plane."""
from __future__ import annotations

from dataclasses import asdict

from .state_store import ResearchStateStore


def list_recent_runs_view(
    *,
    store: ResearchStateStore | None = None,
    pattern_slug: str | None = None,
    limit: int = 20,
) -> list[dict]:
    store = store or ResearchStateStore()
    rows = []
    for run in store.list_runs(pattern_slug=pattern_slug, limit=limit):
        approval = store.get_operator_decision(run.research_run_id)
        rows.append(
            {
                "research_run_id": run.research_run_id,
                "pattern_slug": run.pattern_slug,
                "objective_id": run.objective_id,
                "status": run.status,
                "completion_disposition": run.completion_disposition,
                "created_at": run.created_at,
                "completed_at": run.completed_at,
                "approval_decision": approval.decision if approval is not None else None,
            }
        )
    return rows


def get_run_detail_view(research_run_id: str, *, store: ResearchStateStore | None = None) -> dict:
    store = store or ResearchStateStore()
    run = store.get_run(research_run_id)
    if run is None:
        raise KeyError(f"Research run not found: {research_run_id}")
    selection = store.get_selection_decision(research_run_id)
    memory_notes = store.list_memory_notes(research_run_id=research_run_id)
    operator_decision = store.get_operator_decision(research_run_id)
    control_state = store.get_pattern_control_state(run.pattern_slug)
    return {
        "research_run": asdict(run),
        "selection_decision": asdict(selection) if selection is not None else None,
        "memory_notes": [asdict(note) for note in memory_notes],
        "operator_decision": asdict(operator_decision) if operator_decision is not None else None,
        "pattern_control_state": asdict(control_state),
        "report_path": run.handoff_payload.get("report_path"),
        "training_result": run.handoff_payload.get("training_result"),
    }


def get_pattern_summary_view(pattern_slug: str, *, store: ResearchStateStore | None = None) -> dict:
    store = store or ResearchStateStore()
    runs = store.list_runs(pattern_slug=pattern_slug, limit=10)
    control_state = store.get_pattern_control_state(pattern_slug)
    return {
        "pattern_slug": pattern_slug,
        "recent_run_count": len(runs),
        "recent_dead_end_count": sum(1 for run in runs if run.completion_disposition == "dead_end"),
        "recent_train_candidate_count": sum(
            1 for run in runs if run.completion_disposition == "train_candidate"
        ),
        "recent_no_op_count": sum(1 for run in runs if run.completion_disposition == "no_op"),
        "control_state": asdict(control_state),
    }
