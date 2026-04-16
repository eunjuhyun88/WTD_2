"""Objective and readiness-policy derivation for bounded pattern refinement."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from ledger.dataset import PatternDatasetSummary
from ledger.dataset import summarize_pattern_dataset
from ledger.store import LedgerStore
from scoring.lightgbm_engine import MIN_TRAIN_RECORDS


@dataclass(frozen=True)
class PatternReadinessDeficit:
    kind: str
    current: int | float | None
    required: int | float | None
    missing: int | float | None
    action: str


@dataclass(frozen=True)
class PatternReadinessPlan:
    train_ready: bool
    state: str
    reason: str
    deficits: list[PatternReadinessDeficit]
    next_actions: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class PatternResearchObjective:
    objective_id: str
    objective_kind: str
    pattern_slug: str
    rationale: str
    dataset_summary: dict
    readiness_plan: dict
    recommended_search_policy: dict
    recommended_evaluation_protocol: dict
    supporting_signals: dict

    def to_dict(self) -> dict:
        return asdict(self)


def derive_pattern_research_objective(
    pattern_slug: str,
    *,
    ledger_store: LedgerStore | None = None,
    state_store: object | None = None,
    recent_limit: int = 10,
) -> PatternResearchObjective:
    ledger_store = ledger_store or LedgerStore()
    summary = summarize_pattern_dataset(ledger_store.list_all(pattern_slug))
    summary_dict = summary.to_dict()
    readiness_plan = build_pattern_readiness_plan(pattern_slug, summary)
    recent_signals = _recent_research_signals(pattern_slug, state_store, limit=recent_limit)

    if not summary.ready_to_train:
        objective_kind = "dataset_readiness"
        search_policy = {
            "mode": "readiness_accumulation",
            "allowed_train_handoff": False,
            "next_actions": readiness_plan.next_actions,
        }
        return _objective(
            pattern_slug=pattern_slug,
            objective_kind=objective_kind,
            rationale=(
                f"Dataset not train-ready. Need at least {MIN_TRAIN_RECORDS} usable records "
                f"and both classes. Current status: {summary.readiness_reason}"
            ),
            summary_dict=summary_dict,
            readiness_plan=readiness_plan,
            search_policy=search_policy,
            supporting_signals=recent_signals,
        )

    if recent_signals["recent_dead_end_count"] >= 3:
        return _objective(
            pattern_slug=pattern_slug,
            objective_kind="reset_search",
            rationale=(
                "Dataset is train-ready, but recent research history shows repeated dead ends. "
                "Reset search rather than continuing a local bounded refresh."
            ),
            summary_dict=summary_dict,
            readiness_plan=readiness_plan,
            search_policy={
                "mode": "reset_search",
                "allowed_train_handoff": False,
                "reset_reason": "repeated_dead_ends",
            },
            supporting_signals=recent_signals,
        )

    if _looks_like_scoring_drift(summary):
        return _objective(
            pattern_slug=pattern_slug,
            objective_kind="scoring_drift_review",
            rationale=(
                "Dataset is train-ready, but threshold separation is weak. "
                "Review scoring drift before treating the current candidate as a normal refresh."
            ),
            summary_dict=summary_dict,
            readiness_plan=readiness_plan,
            search_policy={
                "mode": "dead_end_confirmation",
                "allowed_train_handoff": False,
                "drift_signal": "weak_threshold_separation",
            },
            supporting_signals=recent_signals,
        )

    if summary.last_model_version is None:
        return _objective(
            pattern_slug=pattern_slug,
            objective_kind="first_train_candidate",
            rationale="Dataset is ready and no prior model version is recorded.",
            summary_dict=summary_dict,
            readiness_plan=readiness_plan,
            search_policy={
                "mode": "bounded_walk_forward",
                "allowed_train_handoff": True,
                "target": "first_candidate",
            },
            supporting_signals=recent_signals,
        )

    return _objective(
        pattern_slug=pattern_slug,
        objective_kind="refresh_train_candidate",
        rationale=f"Dataset is ready and the latest recorded model is {summary.last_model_version}.",
        summary_dict=summary_dict,
        readiness_plan=readiness_plan,
        search_policy={
            "mode": "local_refresh_sweep",
            "allowed_train_handoff": True,
            "baseline_model_version": summary.last_model_version,
        },
        supporting_signals=recent_signals,
    )


def build_pattern_readiness_plan(pattern_slug: str, summary: PatternDatasetSummary) -> PatternReadinessPlan:
    deficits: list[PatternReadinessDeficit] = []
    next_actions: list[str] = []

    if summary.training_usable_count < MIN_TRAIN_RECORDS:
        missing = MIN_TRAIN_RECORDS - summary.training_usable_count
        deficits.append(
            PatternReadinessDeficit(
                kind="usable_decided_records",
                current=summary.training_usable_count,
                required=MIN_TRAIN_RECORDS,
                missing=missing,
                action=f"Collect {missing} more decided pattern outcomes with feature snapshots.",
            )
        )
        next_actions.append(f"collect_decided_outcomes:{missing}")

    if summary.training_win_count == 0:
        deficits.append(
            PatternReadinessDeficit(
                kind="positive_class",
                current=summary.training_win_count,
                required=1,
                missing=1,
                action="Capture at least one successful outcome before training.",
            )
        )
        next_actions.append("capture_success_class")

    if summary.training_loss_count == 0:
        deficits.append(
            PatternReadinessDeficit(
                kind="negative_class",
                current=summary.training_loss_count,
                required=1,
                missing=1,
                action="Capture at least one failed or timed-out outcome before training.",
            )
        )
        next_actions.append("capture_failure_class")

    if summary.score_coverage is not None and summary.score_coverage < 0.7:
        deficits.append(
            PatternReadinessDeficit(
                kind="score_coverage",
                current=round(summary.score_coverage, 4),
                required=0.7,
                missing=round(0.7 - summary.score_coverage, 4),
                action="Increase entry scoring coverage so future readiness decisions can compare threshold behavior.",
            )
        )
        next_actions.append("increase_entry_score_coverage")

    if not deficits:
        state = "train_ready"
        next_actions = ["run_bounded_walk_forward_eval"]
    elif summary.training_usable_count < MIN_TRAIN_RECORDS:
        state = "needs_more_records"
    else:
        state = "needs_class_balance"

    return PatternReadinessPlan(
        train_ready=summary.ready_to_train,
        state=state,
        reason=summary.readiness_reason,
        deficits=deficits,
        next_actions=next_actions,
    )


def _objective(
    *,
    pattern_slug: str,
    objective_kind: str,
    rationale: str,
    summary_dict: dict,
    readiness_plan: PatternReadinessPlan,
    search_policy: dict,
    supporting_signals: dict,
) -> PatternResearchObjective:
    return PatternResearchObjective(
        objective_id=f"{pattern_slug}:{objective_kind.replace('_', '-')}-v1",
        objective_kind=objective_kind,
        pattern_slug=pattern_slug,
        rationale=rationale,
        dataset_summary=summary_dict,
        readiness_plan=readiness_plan.to_dict(),
        recommended_search_policy=search_policy,
        recommended_evaluation_protocol=_evaluation_protocol_for(objective_kind),
        supporting_signals={
            **supporting_signals,
            "readiness_state": readiness_plan.state,
            "readiness_deficit_kinds": [deficit.kind for deficit in readiness_plan.deficits],
        },
    )


def _evaluation_protocol_for(objective_kind: str) -> dict:
    if objective_kind == "reset_search":
        return {
            "kind": "walk-forward",
            "n_splits": 6,
            "min_mean_auc": 0.58,
            "max_std_auc": 0.10,
            "baseline_comparison": "required",
        }
    if objective_kind == "scoring_drift_review":
        return {
            "kind": "threshold-separation-review",
            "n_splits": 5,
            "min_mean_auc": 0.55,
            "max_std_auc": 0.12,
            "baseline_comparison": "required",
        }
    if objective_kind == "dataset_readiness":
        return {
            "kind": "readiness-only",
            "n_splits": 0,
            "min_mean_auc": None,
            "max_std_auc": None,
            "baseline_comparison": "not_applicable",
        }
    return {
        "kind": "walk-forward",
        "n_splits": 5,
        "min_mean_auc": 0.55,
        "max_std_auc": 0.12,
        "baseline_comparison": "preferred_model_or_shadow",
    }


def _recent_research_signals(pattern_slug: str, state_store: object | None, *, limit: int) -> dict:
    runs = []
    if state_store is not None and hasattr(state_store, "list_runs"):
        try:
            runs = list(state_store.list_runs(pattern_slug=pattern_slug, status="completed", limit=limit))
        except TypeError:
            runs = list(state_store.list_runs(pattern_slug=pattern_slug, limit=limit))
    dispositions = [getattr(run, "completion_disposition", None) for run in runs]
    return {
        "recent_run_count": len(runs),
        "recent_dead_end_count": dispositions.count("dead_end"),
        "recent_no_op_count": dispositions.count("no_op"),
        "recent_train_candidate_count": dispositions.count("train_candidate"),
    }


def _looks_like_scoring_drift(summary: PatternDatasetSummary) -> bool:
    if not summary.ready_to_train:
        return False
    if summary.above_threshold_success_rate is None or summary.below_threshold_success_rate is None:
        return False
    return summary.above_threshold_success_rate <= summary.below_threshold_success_rate
