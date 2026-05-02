"""Concrete Phase A refinement jobs backed by pattern ledger evidence."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

from ledger.dataset import build_pattern_training_records, summarize_pattern_dataset
from ledger.store import LedgerStore, get_ledger_store, list_outcomes_for_definition
from patterns.definition_refs import definition_id_from_ref
from patterns.definitions import PatternDefinitionService, current_definition_id
from patterns.library import get_pattern
from patterns.model_key import make_pattern_model_key
from patterns.model_registry import MODEL_REGISTRY_STORE

from research.validation.eval_protocol import walk_forward_eval
from research.validation.objectives import PatternResearchObjective, derive_pattern_research_objective
from research.artifacts.state_store import ResearchRun, ResearchStateStore
from research.discovery.worker_control import (
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
    definition_ref: dict = field(default_factory=dict)
    search_mode: str = "bounded-walk-forward-eval"
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
    objective: PatternResearchObjective | None = None,
) -> ResearchRun:
    """Run one bounded Phase A refinement job for a pattern."""
    pattern = get_pattern(config.pattern_slug)
    definition_ref = _resolve_definition_ref(
        pattern_slug=config.pattern_slug,
        definition_ref=config.definition_ref,
    )
    controller = controller or ResearchWorkerController()
    state_store = controller.store
    ledger_store = ledger_store or get_ledger_store()
    objective = objective or (
        derive_pattern_research_objective(config.pattern_slug, ledger_store=ledger_store)
        if config.objective_id is None
        else None
    )
    baseline_ref = config.baseline_ref or _derive_baseline_ref(config.pattern_slug, state_store=state_store)
    baseline_family_ref = _derive_baseline_family_ref(baseline_ref)
    search_policy = (
        objective.recommended_search_policy
        if objective is not None
        else {
            "policy": "bounded_walk_forward",
            "mode": config.search_mode,
        }
    )
    evaluation_protocol = (
        objective.recommended_evaluation_protocol
        if objective is not None
        else {
            "kind": "walk-forward",
            "n_splits": config.n_splits,
            "min_mean_auc": config.min_mean_auc,
            "max_std_auc": config.max_std_auc,
        }
    )
    n_splits = int(evaluation_protocol.get("n_splits", config.n_splits))
    min_mean_auc = float(evaluation_protocol.get("min_mean_auc", config.min_mean_auc))
    max_std_auc = float(evaluation_protocol.get("max_std_auc", config.max_std_auc))

    spec = ResearchJobSpec(
        pattern_slug=config.pattern_slug,
        objective_id=config.objective_id or objective.objective_id,
        baseline_ref=baseline_ref,
        search_policy={**search_policy, "target_name": config.target_name},
        evaluation_protocol=evaluation_protocol,
        definition_ref=definition_ref,
    )

    def _execute(run: ResearchRun) -> ResearchJobResult:
        outcomes = list_outcomes_for_definition(
            ledger_store,
            config.pattern_slug,
            definition_id=definition_id_from_ref(run.definition_ref),
        )
        summary = summarize_pattern_dataset(outcomes)

        if not summary.ready_to_train:
            return ResearchJobResult(
                disposition="no_op",
                selection_decision=SelectionDecisionInput(
                    decision_kind="reject",
                    rationale=summary.readiness_reason,
                    baseline_ref=run.baseline_ref,
                    metrics={
                        "definition_ref": run.definition_ref,
                        "dataset_summary": summary.to_dict(),
                    },
                ),
                memory_notes=[
                    ResearchMemoryInput(
                        note_kind="assumption_update",
                        summary="Pattern dataset is not ready for bounded train-candidate evaluation.",
                        detail=summary.readiness_reason,
                        tags=["dataset", "readiness", config.pattern_slug],
                    )
                ],
            )

        records = build_pattern_training_records(outcomes)
        X, y = _pattern_training_matrix(records)
        metrics = walk_forward_eval(X, y, n_splits=n_splits)
        aggregate_metrics = {
            "definition_ref": run.definition_ref,
            "dataset_summary": summary.to_dict(),
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
            definition_ref=run.definition_ref,
        )
        variant_ref = f"pattern-model:{model_key}"

        if mean_auc < min_mean_auc or std_auc > max_std_auc:
            rationale = (
                f"Candidate rejected: mean_auc={mean_auc:.4f}, std_auc={std_auc:.4f}, "
                f"gate=({min_mean_auc:.2f}, {max_std_auc:.2f})."
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
                "definition_ref": run.definition_ref,
                "baseline_ref": run.baseline_ref,
                "baseline_family_ref": baseline_family_ref,
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


def _resolve_definition_ref(*, pattern_slug: str, definition_ref: dict | None) -> dict:
    if isinstance(definition_ref, dict) and definition_ref:
        return dict(definition_ref)
    return (
        PatternDefinitionService().get_definition_ref(pattern_slug=pattern_slug)
        or {"pattern_slug": pattern_slug}
    )


def _pattern_training_matrix(records: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    snapshots = [record["snapshot"] for record in records]
    labels = np.array([int(record["outcome"]) for record in records], dtype=int)
    X = _encode_snapshots(snapshots)
    return X, labels


def _encode_snapshots(snapshots: list[dict]) -> np.ndarray:
    from scoring.feature_matrix import encode_features_df

    return encode_features_df(pd.DataFrame(snapshots))


def _derive_baseline_ref(pattern_slug: str, *, state_store: ResearchStateStore | None = None) -> str:
    """Derive the next refinement baseline ref.

    Preference order:
    1. Most recent completed run with ``promoted_family_ref`` set (i.e. a
       gate-cleared PromotionReport). This is the canonical post-promotion
       baseline defined by the core loop.
    2. Most recent completed run with ``baseline_family_ref`` set (legacy
       pre-promotion behaviour; kept for backward compatibility with runs
       that predate the promotion gate).
    3. The preferred model-registry scoring model, if any.
    4. ``pattern-shadow:rule-first`` fallback.
    """
    if state_store is not None:
        runs = list(state_store.list_runs(pattern_slug=pattern_slug, status="completed"))
        for run in runs:
            promoted_family_ref = run.handoff_payload.get("promoted_family_ref")
            if promoted_family_ref:
                return str(promoted_family_ref)
        for run in runs:
            baseline_family_ref = run.handoff_payload.get("baseline_family_ref")
            if baseline_family_ref:
                return str(baseline_family_ref)
    definition_id = current_definition_id(pattern_slug)
    preferred = MODEL_REGISTRY_STORE.get_preferred_scoring_model(
        pattern_slug,
        definition_id=definition_id,
    )
    if preferred is None and definition_id is not None:
        preferred = MODEL_REGISTRY_STORE.get_preferred_scoring_model(pattern_slug)
    if preferred is None:
        return "pattern-shadow:rule-first"
    return f"model:{preferred.model_key}:{preferred.model_version}:{preferred.rollout_state}"


def _derive_baseline_family_ref(baseline_ref: str) -> str | None:
    return baseline_ref if baseline_ref.startswith("family:") else None


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
