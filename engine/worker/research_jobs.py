"""Worker-control one-shot triggers for refinement methodology jobs."""
from __future__ import annotations

from research.objectives import derive_pattern_research_objective
from research.pattern_refinement import (
    PatternBoundedEvalConfig,
    pattern_bounded_eval_payload,
    run_pattern_bounded_eval,
)
from research.reporting import write_refinement_report
from research.state_store import ResearchStateStore
from research.worker_control import ResearchWorkerController


def run_pattern_refinement_once(
    pattern_slug: str,
    *,
    state_store: ResearchStateStore | None = None,
) -> dict:
    """Derive an objective and execute one bounded refinement job."""
    state_store = state_store or ResearchStateStore()
    controller = ResearchWorkerController(state_store)
    objective = derive_pattern_research_objective(pattern_slug, state_store=state_store)
    run = run_pattern_bounded_eval(
        PatternBoundedEvalConfig(
            pattern_slug=pattern_slug,
            objective_id=objective.objective_id,
            search_mode=str(objective.recommended_search_policy.get("mode", "bounded-walk-forward-eval")),
            n_splits=int(objective.recommended_evaluation_protocol.get("n_splits", 5)),
            min_mean_auc=float(objective.recommended_evaluation_protocol.get("min_mean_auc", 0.55)),
            max_std_auc=float(objective.recommended_evaluation_protocol.get("max_std_auc", 0.12)),
        ),
        controller=controller,
        objective=objective,
    )
    report_path = write_refinement_report(run, objective=objective.to_dict(), store=state_store)
    updated_run = state_store.update_handoff_payload(
        run.research_run_id,
        payload={"report_path": str(report_path)},
        updated_at=run.updated_at,
    )
    payload = pattern_bounded_eval_payload(updated_run, controller)
    payload["objective"] = objective.to_dict()
    payload["report_path"] = str(report_path)
    return payload
