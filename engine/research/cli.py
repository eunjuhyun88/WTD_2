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
from .tracker import ExperimentTracker


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

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

