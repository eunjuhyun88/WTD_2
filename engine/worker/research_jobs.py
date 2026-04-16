"""Worker-control one-shot triggers for refinement methodology jobs."""
from __future__ import annotations

from research.objectives import derive_pattern_research_objective
from research.pattern_refinement import (
    PatternBoundedEvalConfig,
    pattern_bounded_eval_payload,
    run_pattern_bounded_eval,
)
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
        ),
        controller=controller,
    )
    payload = pattern_bounded_eval_payload(run, controller)
    payload["objective"] = objective.to_dict()
    return payload
