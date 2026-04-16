"""Concrete Phase A refinement jobs backed by pattern ledger evidence."""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from ledger.dataset import build_pattern_training_records, summarize_pattern_dataset
from ledger.store import LedgerStore
from patterns.library import get_pattern
from patterns.model_key import make_pattern_model_key
from patterns.model_registry import MODEL_REGISTRY_STORE

from .eval_protocol import walk_forward_eval
from .objectives import derive_pattern_research_objective
from .state_store import ResearchRun
from .worker_control import (
    ResearchJobResult,
    ResearchJobSpec,
    ResearchMemoryInput,
    ResearchWorkerController,
    SelectionDecisionInput,
)


@dataclass(frozen=True)
class PatternBoundedEvalConfig:
    pattern_slug: str
    objective_id: str | None = None
    target_name: str = "breakout"
    feature_schema_version: int = 1
    label_policy_version: int = 1
    threshold_policy_version: int = 1
    n_splits: int = 5
    min_mean_auc: float = 0.55
    max_std_auc: float = 0.12
    baseline_ref: str | None = None


def run_pattern_bounded_eval(
    config: PatternBoundedEvalConfig,
    *,
    controller: ResearchWorkerController | None = None,
    ledger_store: LedgerStore | None = None,
) -> ResearchRun:
    """Run one bounded Phase A refinement job for a pattern."""
    pattern = get_pattern(config.pattern_slug)
    ledger_store = ledger_store or LedgerStore()
    controller = controller or ResearchWorkerController()
    objective = (
        derive_pattern_research_objective(
            config.pattern_slug,
            ledger_store=ledger_store,
            state_store=controller.store,
        )
        if config.objective_id is None
        else None
    )
    baseline_ref = config.baseline_ref or _derive_baseline_ref(config.pattern_slug)
    policy_objective = objective or derive_pattern_research_objective(
        config.pattern_slug,
        ledger_store=ledger_store,
        state_store=controller.store,
    )
    search_policy = {
        **policy_objective.recommended_search_policy,
        "execution_backend": "pattern_bounded_eval",
        "n_splits": config.n_splits,
        "target_name": config.target_name,
    }
    evaluation_protocol = {
        **policy_objective.recommended_evaluation_protocol,
        "kind": "walk-forward" if policy_objective.objective_kind != "dataset_readiness" else "readiness-only",
        "n_splits": config.n_splits if policy_objective.objective_kind != "dataset_readiness" else 0,
        "min_mean_auc": config.min_mean_auc if policy_objective.objective_kind != "dataset_readiness" else None,
        "max_std_auc": config.max_std_auc if policy_objective.objective_kind != "dataset_readiness" else None,
    }

    spec = ResearchJobSpec(
        pattern_slug=config.pattern_slug,
        objective_id=config.objective_id or policy_objective.objective_id,
        baseline_ref=baseline_ref,
        search_policy=search_policy,
        evaluation_protocol=evaluation_protocol,
    )

    def _execute(run: ResearchRun) -> ResearchJobResult:
        outcomes = ledger_store.list_all(config.pattern_slug)
        summary = summarize_pattern_dataset(outcomes)

        if not summary.ready_to_train:
            readiness_metrics = {
                "dataset_summary": summary.to_dict(),
                "readiness_plan": policy_objective.readiness_plan,
                "recommended_search_policy": policy_objective.recommended_search_policy,
                "recommended_evaluation_protocol": policy_objective.recommended_evaluation_protocol,
                "supporting_signals": policy_objective.supporting_signals,
            }
            next_actions = policy_objective.readiness_plan.get("next_actions", [])
            return ResearchJobResult(
                disposition="no_op",
                selection_decision=SelectionDecisionInput(
                    decision_kind="reject",
                    rationale=summary.readiness_reason,
                    baseline_ref=run.baseline_ref,
                    metrics=readiness_metrics,
                ),
                memory_notes=[
                    ResearchMemoryInput(
                        note_kind="assumption_update",
                        summary="Pattern dataset is not ready for bounded train-candidate evaluation.",
                        detail=f"{summary.readiness_reason}; next_actions={next_actions}",
                        tags=["dataset", "readiness", config.pattern_slug],
                    )
                ],
            )

        records = build_pattern_training_records(outcomes)
        X, y = _pattern_training_matrix(records)
        metrics = walk_forward_eval(X, y, n_splits=config.n_splits)
        aggregate_metrics = {
            "dataset_summary": summary.to_dict(),
            "readiness_plan": policy_objective.readiness_plan,
            "recommended_search_policy": policy_objective.recommended_search_policy,
            "recommended_evaluation_protocol": policy_objective.recommended_evaluation_protocol,
            "supporting_signals": policy_objective.supporting_signals,
            "eval": metrics,
        }

        if "error" in metrics:
            return ResearchJobResult(
                disposition="dead_end",
                selection_decision=SelectionDecisionInput(
                    decision_kind="dead_end",
                    rationale=f"Evaluation failed: {metrics['error']}",
                    baseline_ref=run.baseline_ref,
                    metrics=aggregate_metrics,
                ),
                memory_notes=[
                    ResearchMemoryInput(
                        note_kind="dead_end",
                        summary="Bounded evaluation produced no valid folds.",
                        detail=str(metrics["error"]),
                        tags=["evaluation", "folds", config.pattern_slug],
                    )
                ],
            )

        mean_auc = float(metrics.get("mean_auc", 0.0))
        std_auc = float(metrics.get("std_auc", 0.0))
        model_key = make_pattern_model_key(
            config.pattern_slug,
            pattern.timeframe,
            config.target_name,
            config.feature_schema_version,
            config.label_policy_version,
        )
        variant_ref = f"pattern-model:{model_key}"

        if mean_auc < config.min_mean_auc or std_auc > config.max_std_auc:
            rationale = (
                f"Candidate rejected: mean_auc={mean_auc:.4f}, std_auc={std_auc:.4f}, "
                f"gate=({config.min_mean_auc:.2f}, {config.max_std_auc:.2f})."
            )
            return ResearchJobResult(
                disposition="dead_end",
                winner_variant_ref=variant_ref,
                selection_decision=SelectionDecisionInput(
                    decision_kind="dead_end",
                    rationale=rationale,
                    baseline_ref=run.baseline_ref,
                    selected_variant_ref=variant_ref,
                    metrics=aggregate_metrics,
                ),
                memory_notes=[
                    ResearchMemoryInput(
                        note_kind="dead_end",
                        summary="Bounded walk-forward candidate failed the methodology gate.",
                        detail=rationale,
                        tags=["auc", "variance", config.pattern_slug],
                    )
                ],
            )

        rationale = (
            f"Candidate cleared bounded evaluation gate: mean_auc={mean_auc:.4f}, "
            f"std_auc={std_auc:.4f}."
        )
        return ResearchJobResult(
            disposition="train_candidate",
            winner_variant_ref=variant_ref,
            handoff_payload={
                "pattern_slug": config.pattern_slug,
                "model_key": model_key,
                "timeframe": pattern.timeframe,
                "target_name": config.target_name,
                "feature_schema_version": config.feature_schema_version,
                "label_policy_version": config.label_policy_version,
                "threshold_policy_version": config.threshold_policy_version,
                "n_records": len(records),
                "n_wins": int((y == 1).sum()),
                "n_losses": int((y == 0).sum()),
                "mean_auc": mean_auc,
                "std_auc": std_auc,
            },
            selection_decision=SelectionDecisionInput(
                decision_kind="train_candidate",
                rationale=rationale,
                baseline_ref=run.baseline_ref,
                selected_variant_ref=variant_ref,
                metrics=aggregate_metrics,
            ),
            memory_notes=[
                ResearchMemoryInput(
                    note_kind="breakthrough",
                    summary="Pattern candidate cleared bounded walk-forward gate.",
                    detail=rationale,
                    tags=["train-candidate", "walk-forward", config.pattern_slug],
                )
            ],
        )

    return controller.run_bounded_job(spec, execute=_execute)


def _pattern_training_matrix(records: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    snapshots = [record["snapshot"] for record in records]
    labels = np.array([int(record["outcome"]) for record in records], dtype=int)
    X = _encode_snapshots(snapshots)
    return X, labels


def _encode_snapshots(snapshots: list[dict]) -> np.ndarray:
    from scoring.feature_matrix import encode_features_df

    return encode_features_df(pd.DataFrame(snapshots))


def _derive_baseline_ref(pattern_slug: str) -> str:
    preferred = MODEL_REGISTRY_STORE.get_preferred_scoring_model(pattern_slug)
    if preferred is None:
        return "pattern-shadow:rule-first"
    return f"model:{preferred.model_key}:{preferred.model_version}:{preferred.rollout_state}"


def pattern_bounded_eval_payload(run: ResearchRun, controller: ResearchWorkerController | None = None) -> dict:
    """Return a compact payload for CLI or worker logs."""
    store = (controller.store if controller is not None else ResearchWorkerController().store)
    decision = store.get_selection_decision(run.research_run_id)
    notes = [asdict(note) for note in store.list_memory_notes(research_run_id=run.research_run_id)]
    return {
        "research_run": asdict(run),
        "selection_decision": asdict(decision) if decision is not None else None,
        "memory_notes": notes,
    }
