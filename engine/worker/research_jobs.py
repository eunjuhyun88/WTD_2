"""Worker-control one-shot triggers for refinement methodology jobs."""
from __future__ import annotations

import logging

from research.objectives import derive_pattern_research_objective

log = logging.getLogger(__name__)
from research.pattern_refinement import (
    PatternBoundedEvalConfig,
    pattern_bounded_eval_payload,
    run_pattern_bounded_eval,
)
from research.pattern_search import (
    PatternBenchmarkSearchConfig,
    pattern_benchmark_search_payload,
    run_pattern_benchmark_search,
)
from research.reporting import write_refinement_report
from research.state_store import ResearchStateStore
from research.train_handoff import execute_train_candidate_handoff
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


def run_pattern_search_refinement_once(
    pattern_slug: str,
    *,
    state_store: ResearchStateStore | None = None,
) -> dict:
    """Run benchmark-search, then immediately execute bounded refinement on the promoted family baseline."""
    state_store = state_store or ResearchStateStore()
    controller = ResearchWorkerController(state_store)

    search_run = run_pattern_benchmark_search(
        PatternBenchmarkSearchConfig(pattern_slug=pattern_slug),
        controller=controller,
    )
    search_payload = pattern_benchmark_search_payload(search_run, controller=controller)
    objective = derive_pattern_research_objective(pattern_slug, state_store=state_store)
    baseline_family_ref = search_run.handoff_payload.get("baseline_family_ref")

    refinement_run = run_pattern_bounded_eval(
        PatternBoundedEvalConfig(
            pattern_slug=pattern_slug,
            objective_id=objective.objective_id,
            definition_ref=search_run.definition_ref,
            search_mode=str(objective.recommended_search_policy.get("mode", "bounded-walk-forward-eval")),
            n_splits=int(objective.recommended_evaluation_protocol.get("n_splits", 5)),
            min_mean_auc=float(objective.recommended_evaluation_protocol.get("min_mean_auc", 0.55)),
            max_std_auc=float(objective.recommended_evaluation_protocol.get("max_std_auc", 0.12)),
            baseline_ref=str(baseline_family_ref) if baseline_family_ref else None,
        ),
        controller=controller,
        objective=objective,
    )
    training_result = None
    if refinement_run.completion_disposition == "train_candidate":
        refinement_run, training_result = execute_train_candidate_handoff(
            refinement_run.research_run_id,
            store=state_store,
        )
    refinement_run = state_store.update_handoff_payload(
        refinement_run.research_run_id,
        payload={
            "definition_ref": refinement_run.definition_ref,
            "baseline_family_ref": baseline_family_ref,
            "upstream_search_run_id": search_run.research_run_id,
            "upstream_search_definition_ref": search_run.definition_ref,
            "upstream_search_winner_variant_ref": search_run.winner_variant_ref,
            "upstream_search_active_family_key": search_run.handoff_payload.get("active_family_key"),
            "upstream_search_baseline_family_ref": baseline_family_ref,
        },
        updated_at=refinement_run.updated_at,
    )
    report_path = write_refinement_report(refinement_run, objective=objective.to_dict(), store=state_store)
    refinement_run = state_store.update_handoff_payload(
        refinement_run.research_run_id,
        payload={"report_path": str(report_path)},
        updated_at=refinement_run.updated_at,
    )

    # V-track G1~G7 validation (W-0280) — log-only, Phase 1
    gate_v2_result = None
    try:
        from research.validation.runner import run_full_validation
        gate_v2_result = run_full_validation(search_run.research_run_id)
        if gate_v2_result is not None:
            log.info(
                "GateV2Result: slug=%s overall_pass=%s all_new_pass=%s",
                pattern_slug,
                gate_v2_result.overall_pass,
                gate_v2_result.all_new_pass,
            )
    except Exception as _exc:
        log.warning("V-track gate_v2 skipped: %s", _exc)

    payload = {
        "search": search_payload,
        "objective": objective.to_dict(),
        "refinement": pattern_bounded_eval_payload(refinement_run, controller),
        "report_path": str(report_path),
        "training_handoff": training_result,
        "gate_v2_result": gate_v2_result.to_dict() if gate_v2_result is not None else None,
    }
    return payload
