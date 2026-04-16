"""Operator-readable reports for completed research runs."""
from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .state_store import ResearchRun, ResearchStateStore

REPORT_SCHEMA_VERSION = 1


def research_run_report_path(store: ResearchStateStore, research_run_id: str) -> Path:
    return store.db_path.parent / "reports" / f"{research_run_id}.json"


def build_research_run_report(run: ResearchRun, *, store: ResearchStateStore) -> dict[str, Any]:
    decision = store.get_selection_decision(run.research_run_id)
    notes = store.list_memory_notes(research_run_id=run.research_run_id, limit=10)
    metrics = decision.metrics if decision is not None else {}
    readiness_plan = metrics.get("readiness_plan", {})
    search_policy = metrics.get("recommended_search_policy", run.search_policy)
    evaluation_protocol = metrics.get("recommended_evaluation_protocol", run.evaluation_protocol)

    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "run": {
            "research_run_id": run.research_run_id,
            "pattern_slug": run.pattern_slug,
            "objective_id": run.objective_id,
            "baseline_ref": run.baseline_ref,
            "status": run.status,
            "completion_disposition": run.completion_disposition,
            "winner_variant_ref": run.winner_variant_ref,
            "created_at": run.created_at,
            "started_at": run.started_at,
            "completed_at": run.completed_at,
        },
        "objective_summary": {
            "objective_id": run.objective_id,
            "policy_mode": search_policy.get("mode"),
            "allowed_train_handoff": search_policy.get("allowed_train_handoff"),
            "readiness_state": readiness_plan.get("state"),
        },
        "evidence_summary": metrics.get("dataset_summary", {}),
        "readiness_plan": readiness_plan,
        "search_policy": search_policy,
        "evaluation_protocol": evaluation_protocol,
        "evaluation_result": metrics.get("eval", {}),
        "selection_decision": asdict(decision) if decision is not None else None,
        "research_memory": [asdict(note) for note in notes],
        "training_handoff": run.handoff_payload,
        "operator_recommendation": _operator_recommendation(run, readiness_plan, search_policy),
    }


def write_research_run_report(run: ResearchRun, *, store: ResearchStateStore) -> Path:
    path = research_run_report_path(store, run.research_run_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".json.tmp")
    tmp_path.write_text(
        json.dumps(build_research_run_report(run, store=store), indent=2, sort_keys=True),
        encoding="utf-8",
    )
    tmp_path.replace(path)
    return path


def _operator_recommendation(run: ResearchRun, readiness_plan: dict, search_policy: dict) -> dict[str, Any]:
    disposition = run.completion_disposition
    policy_mode = search_policy.get("mode")

    if run.status != "completed":
        return {
            "action": "wait_for_completion",
            "reason": "Research run is not completed.",
        }
    if disposition == "no_op":
        return {
            "action": "accumulate_evidence",
            "reason": readiness_plan.get("reason", "Pattern dataset is not ready."),
            "next_actions": readiness_plan.get("next_actions", []),
        }
    if disposition == "dead_end" and policy_mode in {"reset_search", "dead_end_confirmation"}:
        return {
            "action": "route_to_matching_executor",
            "reason": f"Policy mode '{policy_mode}' is not handled by bounded train-candidate evaluation.",
        }
    if disposition == "dead_end":
        return {
            "action": "review_rejected_candidate",
            "reason": "Bounded evaluation did not clear the methodology gate.",
        }
    if disposition == "train_candidate":
        if run.handoff_payload.get("training_result") is not None:
            return {
                "action": "review_training_result",
                "reason": "Training handoff has completed; review rollout state before promotion.",
            }
        return {
            "action": "review_train_candidate",
            "reason": "Candidate cleared bounded evaluation; operator approval is required before handoff automation.",
        }
    return {
        "action": "manual_review",
        "reason": "Research disposition is not recognized by the report policy.",
    }
