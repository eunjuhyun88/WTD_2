"""Worker-control CLI for methodology and refinement jobs.

Example:
    uv run --directory engine python -m worker.cli pattern-objective --slug tradoor-oi-reversal-v1
    uv run --directory engine python -m worker.cli pattern-refinement-once --slug tradoor-oi-reversal-v1
"""
from __future__ import annotations

import argparse
import json

from research.objectives import derive_pattern_research_objective
from worker.research_jobs import (
    run_pattern_refinement_once,
    run_pattern_search_refinement_once,
)


def _dump(payload: object) -> None:
    print(json.dumps(payload, indent=2, default=str))


def _run_pattern_objective(args: argparse.Namespace) -> int:
    objective = derive_pattern_research_objective(args.slug)
    _dump(
        {
            "ok": True,
            "runtime_role": "worker-control",
            "command": "pattern-objective",
            "objective": objective.to_dict(),
        }
    )
    return 0


def _run_pattern_refinement_once(args: argparse.Namespace) -> int:
    payload = run_pattern_refinement_once(args.slug)
    _dump(
        {
            "ok": True,
            "runtime_role": "worker-control",
            "command": "pattern-refinement-once",
            **payload,
        }
    )
    return 0


def _run_pattern_search_refinement_once(args: argparse.Namespace) -> int:
    payload = run_pattern_search_refinement_once(args.slug)
    _dump(
        {
            "ok": True,
            "runtime_role": "worker-control",
            "command": "pattern-search-refinement-once",
            **payload,
        }
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="WTD worker-control CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    objective_p = sub.add_parser(
        "pattern-objective",
        help="Derive the current research objective for a pattern on worker-control",
    )
    objective_p.add_argument("--slug", required=True, help="Pattern slug")
    objective_p.set_defaults(func=_run_pattern_objective)

    once_p = sub.add_parser(
        "pattern-refinement-once",
        help="Run one refinement cycle on worker-control",
    )
    once_p.add_argument("--slug", required=True, help="Pattern slug")
    once_p.set_defaults(func=_run_pattern_refinement_once)

    search_refine_p = sub.add_parser(
        "pattern-search-refinement-once",
        help="Run benchmark-search then bounded refinement on worker-control",
    )
    search_refine_p.add_argument("--slug", required=True, help="Pattern slug")
    search_refine_p.set_defaults(func=_run_pattern_search_refinement_once)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
