"""Objective derivation for bounded pattern refinement runs."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from math import isnan

from ledger.dataset import summarize_pattern_dataset
from ledger.store import LedgerStore, get_ledger_store, list_outcomes_for_definition
from patterns.definitions import current_definition_id
from patterns.model_registry import MODEL_REGISTRY_STORE
from research.state_store import ResearchStateStore
from scoring.lightgbm_engine import MIN_TRAIN_RECORDS


@dataclass(frozen=True)
class PatternResearchObjective:
    objective_id: str
    objective_kind: str
    pattern_slug: str
    rationale: str
    baseline_ref_hint: str
    recommended_search_policy: dict
    recommended_evaluation_protocol: dict
    supporting_signals: dict
    dataset_summary: dict
    history_summary: dict

    def to_dict(self) -> dict:
        return asdict(self)


def derive_pattern_research_objective(
    pattern_slug: str,
    *,
    ledger_store: LedgerStore | None = None,
    state_store: ResearchStateStore | None = None,
) -> PatternResearchObjective:
    ledger_store = ledger_store or get_ledger_store()
    state_store = state_store or ResearchStateStore()
    summary = summarize_pattern_dataset(
        list_outcomes_for_definition(
            ledger_store,
            pattern_slug,
            definition_id=current_definition_id(pattern_slug),
        )
    )
    summary_dict = summary.to_dict()
    history_summary = _build_history_summary(pattern_slug, state_store)
    baseline_ref_hint = _derive_baseline_ref_hint(pattern_slug)
    supporting_signals = {
        "readiness_reason": summary.readiness_reason,
        "score_coverage": summary.score_coverage,
        "threshold_pass_rate": summary.threshold_pass_rate,
        "recent_dead_end_count": history_summary["recent_dead_end_count"],
        "recent_train_candidate_count": history_summary["recent_train_candidate_count"],
        "recent_no_op_count": history_summary["recent_no_op_count"],
        "baseline_ref_hint": baseline_ref_hint,
        "recent_high_variance_count": history_summary["recent_high_variance_count"],
        "plateau_detected": history_summary["plateau_detected"],
        "latest_vs_best_mean_auc_delta": history_summary["latest_vs_best_mean_auc_delta"],
    }

    if not summary.ready_to_train:
        return PatternResearchObjective(
            objective_id=f"{pattern_slug}:dataset-readiness-v1",
            objective_kind="dataset_readiness",
            pattern_slug=pattern_slug,
            rationale=(
                f"Dataset not train-ready. Need at least {MIN_TRAIN_RECORDS} usable records "
                f"and both classes. Current status: {summary.readiness_reason}"
            ),
            baseline_ref_hint=baseline_ref_hint,
            recommended_search_policy={
                "policy": "readiness_accumulation",
                "mode": "readiness-check",
            },
            recommended_evaluation_protocol={
                "kind": "walk-forward",
                "n_splits": 3,
                "min_mean_auc": 0.55,
                "max_std_auc": 0.12,
            },
            supporting_signals=supporting_signals,
            dataset_summary=summary_dict,
            history_summary=history_summary,
        )

    drift_mode = _classify_scoring_drift(summary_dict, history_summary)
    if drift_mode is not None:
        supporting_signals["scoring_drift_mode"] = drift_mode
        return PatternResearchObjective(
            objective_id=f"{pattern_slug}:scoring-drift-review-v1",
            objective_kind="scoring_drift_review",
            pattern_slug=pattern_slug,
            rationale=(
                "Dataset is train-ready, but current score coverage or threshold separation suggests "
                "the scoring path may be drifting. "
                + (
                    "Coverage degradation looks structural, so run a confirmation cycle before broader refresh."
                    if drift_mode == "structural"
                    else "Coverage is intact but threshold separation is weakening, so run a bounded refresh probe."
                )
            ),
            baseline_ref_hint=baseline_ref_hint,
            recommended_search_policy={
                "policy": "dead_end_confirmation" if drift_mode == "structural" else "local_refresh_sweep",
                "mode": "drift-confirmation" if drift_mode == "structural" else "drift-refresh-probe",
            },
            recommended_evaluation_protocol={
                "kind": "walk-forward",
                "n_splits": 4 if drift_mode == "structural" else 5,
                "min_mean_auc": 0.56 if drift_mode == "structural" else 0.57,
                "max_std_auc": 0.10 if drift_mode == "structural" else 0.09,
            },
            supporting_signals=supporting_signals,
            dataset_summary=summary_dict,
            history_summary=history_summary,
        )

    reset_reason = _derive_reset_reason(history_summary)
    if reset_reason is not None:
        return PatternResearchObjective(
            objective_id=f"{pattern_slug}:reset-search-v1",
            objective_kind="reset_search",
            pattern_slug=pattern_slug,
            rationale=(
                "Dataset is ready, but recent refinement history shows local search is stalling. "
                f"Escalate to reset-style bounded evaluation. Trigger: {reset_reason}"
            ),
            baseline_ref_hint=baseline_ref_hint,
            recommended_search_policy={
                "policy": "reset_search",
                "mode": "reset-bounded-eval",
            },
            recommended_evaluation_protocol={
                "kind": "walk-forward",
                "n_splits": 6,
                "min_mean_auc": 0.58,
                "max_std_auc": 0.09,
            },
            supporting_signals=supporting_signals,
            dataset_summary=summary_dict,
            history_summary=history_summary,
        )

    if summary.last_model_version is None:
        return PatternResearchObjective(
            objective_id=f"{pattern_slug}:first-train-candidate-v1",
            objective_kind="first_train_candidate",
            pattern_slug=pattern_slug,
            rationale="Dataset is ready and no prior model version is recorded.",
            baseline_ref_hint=baseline_ref_hint,
            recommended_search_policy={
                "policy": "bounded_walk_forward",
                "mode": "bounded-walk-forward-eval",
            },
            recommended_evaluation_protocol={
                "kind": "walk-forward",
                "n_splits": 4,
                "min_mean_auc": 0.55,
                "max_std_auc": 0.12,
            },
            supporting_signals=supporting_signals,
            dataset_summary=summary_dict,
            history_summary=history_summary,
        )

    return PatternResearchObjective(
        objective_id=f"{pattern_slug}:refresh-train-candidate-v1",
        objective_kind="refresh_train_candidate",
        pattern_slug=pattern_slug,
        rationale=f"Dataset is ready and the latest recorded model is {summary.last_model_version}.",
        baseline_ref_hint=baseline_ref_hint,
        recommended_search_policy={
            "policy": "local_refresh_sweep",
            "mode": "stability-check",
        },
        recommended_evaluation_protocol={
            "kind": "walk-forward",
            "n_splits": 5,
            "min_mean_auc": 0.57,
            "max_std_auc": 0.10,
        },
        supporting_signals=supporting_signals,
        dataset_summary=summary_dict,
        history_summary=history_summary,
    )


def _build_history_summary(pattern_slug: str, state_store: ResearchStateStore) -> dict:
    recent_runs = state_store.list_runs(pattern_slug=pattern_slug, limit=5)
    recent_eval_snapshots = []
    for run in recent_runs:
        decision = state_store.get_selection_decision(run.research_run_id)
        if decision is None or not isinstance(decision.metrics, dict):
            continue
        eval_metrics = decision.metrics.get("eval")
        if not isinstance(eval_metrics, dict):
            continue
        mean_auc = _coerce_float(eval_metrics.get("mean_auc"))
        std_auc = _coerce_float(eval_metrics.get("std_auc"))
        gate_mean = _coerce_float(run.evaluation_protocol.get("min_mean_auc"))
        gate_std = _coerce_float(run.evaluation_protocol.get("max_std_auc"))
        if mean_auc is None or std_auc is None:
            continue
        recent_eval_snapshots.append(
            {
                "research_run_id": run.research_run_id,
                "mean_auc": mean_auc,
                "std_auc": std_auc,
                "gate_mean_auc": gate_mean,
                "gate_std_auc": gate_std,
                "disposition": run.completion_disposition,
            }
        )
    latest_eval = recent_eval_snapshots[0] if recent_eval_snapshots else None
    best_eval = max(recent_eval_snapshots, key=lambda item: item["mean_auc"]) if recent_eval_snapshots else None
    mean_aucs = [item["mean_auc"] for item in recent_eval_snapshots]
    std_breaches = [
        item for item in recent_eval_snapshots
        if item["gate_std_auc"] is not None and item["std_auc"] > item["gate_std_auc"]
    ]
    plateau_detected = (
        len(mean_aucs) >= 3
        and (max(mean_aucs) - min(mean_aucs)) <= 0.015
        and sum(1 for run in recent_runs if run.completion_disposition == "train_candidate") == 0
    )
    return {
        "recent_run_count": len(recent_runs),
        "recent_dead_end_count": sum(
            1 for run in recent_runs if run.completion_disposition == "dead_end"
        ),
        "recent_train_candidate_count": sum(
            1 for run in recent_runs if run.completion_disposition == "train_candidate"
        ),
        "recent_no_op_count": sum(
            1 for run in recent_runs if run.completion_disposition == "no_op"
        ),
        "recent_eval_count": len(recent_eval_snapshots),
        "recent_high_variance_count": len(std_breaches),
        "recent_best_mean_auc": best_eval["mean_auc"] if best_eval is not None else None,
        "recent_latest_mean_auc": latest_eval["mean_auc"] if latest_eval is not None else None,
        "recent_latest_std_auc": latest_eval["std_auc"] if latest_eval is not None else None,
        "recent_mean_auc_span": (max(mean_aucs) - min(mean_aucs)) if mean_aucs else None,
        "latest_vs_best_mean_auc_delta": (
            latest_eval["mean_auc"] - best_eval["mean_auc"]
            if latest_eval is not None and best_eval is not None
            else None
        ),
        "plateau_detected": plateau_detected,
    }


def _derive_baseline_ref_hint(pattern_slug: str) -> str:
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


def _classify_scoring_drift(summary_dict: dict, history_summary: dict) -> str | None:
    score_coverage = summary_dict.get("score_coverage")
    threshold_pass_rate = summary_dict.get("threshold_pass_rate")
    train_candidates = history_summary.get("recent_train_candidate_count", 0)
    if train_candidates < 1:
        return None
    if score_coverage is not None and score_coverage < 0.35:
        return "structural"
    if threshold_pass_rate is not None and threshold_pass_rate < 0.15:
        return "incremental"
    return None


def _derive_reset_reason(history_summary: dict) -> str | None:
    recent_dead_ends = int(history_summary.get("recent_dead_end_count", 0) or 0)
    recent_high_variance = int(history_summary.get("recent_high_variance_count", 0) or 0)
    plateau_detected = bool(history_summary.get("plateau_detected"))

    if recent_high_variance >= 2:
        return "repeated variance breaches"
    if plateau_detected:
        return "recent evals are flat with no advancing candidate"
    if recent_dead_ends >= 2:
        return "repeated dead ends"
    return None


def _coerce_float(value: object) -> float | None:
    if isinstance(value, (int, float)):
        coerced = float(value)
        if isnan(coerced):
            return None
        return coerced
    return None
