"""Research CLI for training/eval experiment workflows.

Example:
    uv run python -m research.cli eval --latest
    uv run python -m research.cli list --limit 10
    uv run python -m research.cli report --dir 20260414_120000-my-exp
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .eval_protocol import walk_forward_eval
from .experiment import Experiment
from .inspection import (
    get_pattern_summary_view,
    get_run_detail_view,
    list_recent_runs_view,
)
from .pattern_refinement import (
    PatternBoundedEvalConfig,
    pattern_bounded_eval_payload,
    run_pattern_bounded_eval,
)
from .objectives import derive_pattern_research_objective
from .state_store import ResearchStateStore
from .train_handoff import execute_train_candidate_handoff
from .tracker import ExperimentTracker
from worker.research_jobs import run_pattern_refinement_once


def _parse_optional_bool(value: str | None) -> bool | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"invalid boolean value: {value}")


def _run_eval_latest(args: argparse.Namespace) -> int:
    """Run a baseline eval and store it as an experiment artifact."""
    rng = np.random.default_rng(args.seed)
    n_samples = args.samples
    n_features = args.features

    X = rng.normal(0.0, 1.0, size=(n_samples, n_features))
    # Synthetic label with weak signal to keep smoke runs deterministic.
    signal = X[:, 0] * 0.25 + X[:, 1] * 0.15 + rng.normal(0, 0.8, n_samples)
    y = (signal > np.median(signal)).astype(int)

    with Experiment("walk-forward-eval-latest") as exp:
        exp.log_params(
            {
                "mode": "synthetic-latest",
                "seed": args.seed,
                "n_samples": n_samples,
                "n_features": n_features,
                "n_splits": args.splits,
            }
        )
        metrics = walk_forward_eval(X, y, n_splits=args.splits)
        exp.log_metrics(metrics)
        exp.log_notes("Auto-generated baseline eval from research.cli --latest.")

    print("Eval complete.")
    print(json.dumps(metrics, indent=2))
    return 0


def _run_list(args: argparse.Namespace) -> int:
    tracker = ExperimentTracker()
    rows = tracker.list_experiments(limit=args.limit)
    print(json.dumps(rows, indent=2))
    return 0


def _run_report(args: argparse.Namespace) -> int:
    tracker = ExperimentTracker()
    report = tracker.get_experiment(args.dir)
    if report is None:
        print(json.dumps({"error": "experiment_not_found", "dir": args.dir}))
        return 1
    print(json.dumps(report, indent=2, default=str))
    return 0


def _run_pattern_bounded_eval(args: argparse.Namespace) -> int:
    config = PatternBoundedEvalConfig(
        pattern_slug=args.slug,
        objective_id=args.objective_id,
        target_name=args.target_name,
        feature_schema_version=args.feature_schema_version,
        label_policy_version=args.label_policy_version,
        threshold_policy_version=args.threshold_policy_version,
        n_splits=args.splits,
        min_mean_auc=args.min_mean_auc,
        max_std_auc=args.max_std_auc,
        baseline_ref=args.baseline_ref,
    )
    run = run_pattern_bounded_eval(config)
    print(json.dumps(pattern_bounded_eval_payload(run), indent=2, default=str))
    return 0


def _run_pattern_objective(args: argparse.Namespace) -> int:
    objective = derive_pattern_research_objective(args.slug)
    print(json.dumps(objective.to_dict(), indent=2, default=str))
    return 0


def _run_train_candidate_handoff(args: argparse.Namespace) -> int:
    run, result = execute_train_candidate_handoff(args.research_run_id)
    print(
        json.dumps(
            {
                "research_run": {
                    "research_run_id": run.research_run_id,
                    "completion_disposition": run.completion_disposition,
                    "handoff_payload": run.handoff_payload,
                },
                "training_result": result,
            },
            indent=2,
            default=str,
        )
    )
    return 0


def _run_pattern_refinement_once(args: argparse.Namespace) -> int:
    payload = run_pattern_refinement_once(args.slug)
    print(json.dumps(payload, indent=2, default=str))
    return 0


def _run_refinement_runs(args: argparse.Namespace) -> int:
    rows = list_recent_runs_view(pattern_slug=args.slug, limit=args.limit)
    print(json.dumps(rows, indent=2, default=str))
    return 0


def _run_refinement_run_detail(args: argparse.Namespace) -> int:
    detail = get_run_detail_view(args.research_run_id)
    print(json.dumps(detail, indent=2, default=str))
    return 0


def _run_refinement_pattern_summary(args: argparse.Namespace) -> int:
    summary = get_pattern_summary_view(args.slug)
    print(json.dumps(summary, indent=2, default=str))
    return 0


def _run_operator_decision(args: argparse.Namespace) -> int:
    store = ResearchStateStore()
    decision = store.record_operator_decision(
        research_run_id=args.research_run_id,
        decision=args.decision,
        decided_by=args.decided_by,
        rationale=args.rationale,
        decided_at=args.decided_at,
    )
    print(json.dumps(decision.__dict__, indent=2, default=str))
    return 0


def _run_pattern_control_set(args: argparse.Namespace) -> int:
    store = ResearchStateStore()
    state = store.upsert_pattern_control_state(
        args.slug,
        updated_at=args.updated_at,
        enabled=_parse_optional_bool(args.enabled),
        paused_by_policy=_parse_optional_bool(args.paused_by_policy),
        paused_by_operator=_parse_optional_bool(args.paused_by_operator),
        approval_required=_parse_optional_bool(args.approval_required),
        auto_train_allowed=_parse_optional_bool(args.auto_train_allowed),
        cooldown_until=args.cooldown_until,
        pause_reason=args.pause_reason,
    )
    print(json.dumps(state.__dict__, indent=2, default=str))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="WTD v2 research CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    eval_p = sub.add_parser("eval", help="Run walk-forward eval")
    eval_p.add_argument("--latest", action="store_true", help="Run latest baseline eval")
    eval_p.add_argument("--seed", type=int, default=2026)
    eval_p.add_argument("--samples", type=int, default=800)
    eval_p.add_argument("--features", type=int, default=103)
    eval_p.add_argument("--splits", type=int, default=5)
    eval_p.set_defaults(func=_run_eval_latest)

    list_p = sub.add_parser("list", help="List recent experiments")
    list_p.add_argument("--limit", type=int, default=20)
    list_p.set_defaults(func=_run_list)

    report_p = sub.add_parser("report", help="Show one experiment report")
    report_p.add_argument("--dir", required=True, help="Experiment directory name")
    report_p.set_defaults(func=_run_report)

    bounded_p = sub.add_parser("pattern-bounded-eval", help="Run one bounded pattern refinement job")
    bounded_p.add_argument("--slug", required=True, help="Pattern slug")
    bounded_p.add_argument("--objective-id")
    bounded_p.add_argument("--target-name", default="breakout")
    bounded_p.add_argument("--feature-schema-version", type=int, default=1)
    bounded_p.add_argument("--label-policy-version", type=int, default=1)
    bounded_p.add_argument("--threshold-policy-version", type=int, default=1)
    bounded_p.add_argument("--splits", type=int, default=5)
    bounded_p.add_argument("--min-mean-auc", type=float, default=0.55)
    bounded_p.add_argument("--max-std-auc", type=float, default=0.12)
    bounded_p.add_argument("--baseline-ref")
    bounded_p.set_defaults(func=_run_pattern_bounded_eval)

    objective_p = sub.add_parser("pattern-objective", help="Derive the current bounded refinement objective for a pattern")
    objective_p.add_argument("--slug", required=True, help="Pattern slug")
    objective_p.set_defaults(func=_run_pattern_objective)

    handoff_p = sub.add_parser("train-candidate-handoff", help="Execute training for one completed train-candidate run")
    handoff_p.add_argument("--research-run-id", required=True)
    handoff_p.set_defaults(func=_run_train_candidate_handoff)

    once_p = sub.add_parser("pattern-refinement-once", help="Derive objective, run one refinement cycle, and write a report")
    once_p.add_argument("--slug", required=True, help="Pattern slug")
    once_p.set_defaults(func=_run_pattern_refinement_once)

    runs_p = sub.add_parser("refinement-runs", help="List recent refinement runs")
    runs_p.add_argument("--slug")
    runs_p.add_argument("--limit", type=int, default=20)
    runs_p.set_defaults(func=_run_refinement_runs)

    detail_p = sub.add_parser("refinement-run-detail", help="Show one refinement run detail")
    detail_p.add_argument("--research-run-id", required=True)
    detail_p.set_defaults(func=_run_refinement_run_detail)

    summary_p = sub.add_parser("refinement-pattern-summary", help="Show a pattern refinement summary")
    summary_p.add_argument("--slug", required=True)
    summary_p.set_defaults(func=_run_refinement_pattern_summary)

    op_p = sub.add_parser("operator-decision", help="Record operator approve/defer/reject for a research run")
    op_p.add_argument("--research-run-id", required=True)
    op_p.add_argument("--decision", required=True, choices=["approve", "defer", "reject"])
    op_p.add_argument("--decided-by", required=True)
    op_p.add_argument("--rationale", required=True)
    op_p.add_argument("--decided-at", required=True)
    op_p.set_defaults(func=_run_operator_decision)

    control_p = sub.add_parser("pattern-control-set", help="Update pattern-local refinement control state")
    control_p.add_argument("--slug", required=True)
    control_p.add_argument("--updated-at", required=True)
    control_p.add_argument("--enabled")
    control_p.add_argument("--paused-by-policy")
    control_p.add_argument("--paused-by-operator")
    control_p.add_argument("--approval-required")
    control_p.add_argument("--auto-train-allowed")
    control_p.add_argument("--cooldown-until")
    control_p.add_argument("--pause-reason")
    control_p.set_defaults(func=_run_pattern_control_set)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
