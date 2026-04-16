"""Worker-control handoff from successful research runs into training."""
from __future__ import annotations

from datetime import datetime, timezone

from patterns.training_service import train_pattern_model_from_ledger

from .state_store import ResearchRun, ResearchStateStore


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def execute_train_candidate_handoff(
    research_run_id: str,
    *,
    store: ResearchStateStore | None = None,
) -> tuple[ResearchRun, dict]:
    """Execute the training-lane handoff for a completed `train_candidate` run."""
    store = store or ResearchStateStore()
    run = store.get_run(research_run_id)
    if run is None:
        raise KeyError(f"Research run not found: {research_run_id}")
    if run.status != "completed":
        raise ValueError(f"Research run is not completed: {research_run_id}")
    if run.completion_disposition != "train_candidate":
        raise ValueError(
            f"Research run is not eligible for train handoff: {run.completion_disposition}"
        )
    if run.handoff_payload.get("training_result") is not None:
        raise ValueError(f"Training handoff already executed: {research_run_id}")
    control_state = store.get_pattern_control_state(run.pattern_slug)
    operator_decision = store.get_operator_decision(research_run_id)
    if operator_decision is not None and operator_decision.decision == "reject":
        raise ValueError(f"Research run was rejected by operator: {research_run_id}")
    if control_state.approval_required:
        if operator_decision is None or operator_decision.decision != "approve":
            raise ValueError(f"Operator approval required before train handoff: {research_run_id}")

    payload = run.handoff_payload
    result = train_pattern_model_from_ledger(
        run.pattern_slug,
        target_name=payload.get("target_name", "breakout"),
        feature_schema_version=int(payload.get("feature_schema_version", 1)),
        label_policy_version=int(payload.get("label_policy_version", 1)),
        threshold_policy_version=int(payload.get("threshold_policy_version", 1)),
    )
    updated = store.update_handoff_payload(
        research_run_id,
        payload={
            "training_result": {
                "model_key": result["model_key"],
                "model_version": result["model_version"],
                "replaced": result["replaced"],
                "rollout_state": result["rollout_state"],
                "auc": result["auc"],
                "n_records": result["n_records"],
            }
        },
        updated_at=_utcnow_iso(),
    )
    return updated, result
