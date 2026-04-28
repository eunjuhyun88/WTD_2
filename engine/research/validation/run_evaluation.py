"""W-0289 — Layer P validation CLI.

Loads benchmark packs for a given pattern slug from the local pack store,
runs the full validation pipeline (V-01, V-02, V-06), and prints a
human-readable report.

Usage::

    cd engine
    python -m research.validation.run_evaluation tradoor-oi-reversal-v1
    python -m research.validation.run_evaluation tradoor-oi-reversal-v1 \\
        --horizon 4 --cost-bps 15 --json
    python -m research.validation.run_evaluation --list-slugs

Notes
-----
* Offline mode (default): uses local benchmark_packs JSON files.
  These are small (4~20 cases) — expect n < 30 and wide CIs.
* Production data path (future): pass --supabase to load phase
  transitions from Supabase ``pattern_phase_transitions`` table.
  Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.
* n_trials is set to max(n_samples, 15) to avoid DSR inflate on
  tiny benchmark packs.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


_PACK_DIR = Path(__file__).parent.parent / "pattern_search" / "benchmark_packs"

# Minimum sample warning threshold (W-0214 §7.1)
_MIN_SAMPLES_WARN = 30


def _load_packs_for_slug(pattern_slug: str) -> list:
    """Load all benchmark packs whose slug matches (prefix or exact)."""
    from research.pattern_search import BenchmarkCase, ReplayBenchmarkPack

    matched: list = []
    for p in sorted(_PACK_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text())
        except Exception:
            continue
        slug = data.get("pattern_slug", "")
        # normalize underscores→hyphens for fuzzy matching
        norm_query = pattern_slug.replace("_", "-")
        norm_slug = slug.replace("_", "-")
        if (
            norm_slug == norm_query
            or norm_slug.startswith(norm_query)
            or norm_slug.endswith(norm_query)
            or norm_query in norm_slug
        ):
            matched.append(ReplayBenchmarkPack.from_dict(data))

    return matched


def _merge_packs(packs: list) -> "ReplayBenchmarkPack | None":
    """Merge multiple packs with the same slug into one (union of cases)."""
    if not packs:
        return None
    from research.pattern_search import ReplayBenchmarkPack
    import uuid

    base = packs[0]
    all_cases = list(base.cases)
    for p in packs[1:]:
        all_cases.extend(p.cases)

    return ReplayBenchmarkPack(
        benchmark_pack_id=str(uuid.uuid4()),
        pattern_slug=base.pattern_slug,
        candidate_timeframes=base.candidate_timeframes,
        cases=all_cases,
        created_at=base.created_at,
    )


def _list_slugs() -> None:
    """Print all available pattern slugs from local benchmark packs."""
    slugs: set[str] = set()
    for p in sorted(_PACK_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text())
            slugs.add(data.get("pattern_slug", "?"))
        except Exception:
            pass
    for slug in sorted(slugs):
        print(slug)


def _run_offline(
    pattern_slug: str,
    horizon: int,
    cost_bps: float,
    as_json: bool,
    n_trials: int,
) -> int:
    """Run validation against local benchmark packs. Returns exit code."""
    from research.validation.pipeline import (
        ValidationPipelineConfig,
        run_validation_pipeline,
    )
    from research.validation.cv import PurgedKFoldConfig

    packs = _load_packs_for_slug(pattern_slug)
    if not packs:
        print(
            f"No benchmark packs found for slug '{pattern_slug}'.\n"
            "Run with --list-slugs to see available patterns.",
            file=sys.stderr,
        )
        return 1

    pack = _merge_packs(packs)
    assert pack is not None

    n_cases = len(pack.cases)
    if n_cases < _MIN_SAMPLES_WARN:
        print(
            f"⚠  Only {n_cases} benchmark cases found (need ≥{_MIN_SAMPLES_WARN} "
            "for statistically meaningful results).\n"
            "   Use production Supabase data (--supabase, future) for full validation.",
            file=sys.stderr,
        )

    # Clamp n_trials to avoid inflating DSR on tiny packs
    effective_n_trials = max(n_cases, n_trials)

    config = ValidationPipelineConfig(
        cv_config=PurgedKFoldConfig(n_splits=min(5, max(2, n_cases // 2))),
        cost_bps=cost_bps,
        horizons_hours=(horizon,),
        baselines=("B0", "B1"),
        n_trials=effective_n_trials,
    )

    report = run_validation_pipeline(pack=pack, config=config)

    if as_json:
        print(json.dumps(report.to_dashboard_json(), indent=2, default=str))
        return 0

    _print_report(report, horizon, cost_bps)
    # Exit 0 = ran cleanly (low n or gate FAIL is data-limited, not an error)
    # Exit 2 = f1_kill AND n ≥ MIN_SAMPLES (genuine validation failure)
    if report.f1_kill and n_cases >= _MIN_SAMPLES_WARN:
        return 2
    return 0


def _print_report(report, primary_horizon: int, cost_bps: float) -> None:
    slug = report.pattern_slug
    width = 60
    print(f"\n{'=' * width}")
    print(f"  Layer P Validation: {slug}")
    print(f"  Primary horizon: {primary_horizon}h | Cost: {cost_bps}bps")
    print(f"{'=' * width}\n")

    for hr in report.horizon_reports:
        status = "✅ PASS" if hr.overall_passed else "❌ FAIL"
        ci_lo, ci_hi = hr.bootstrap_ci
        print(
            f"  {hr.horizon_hours:3d}h  mean={hr.mean_return_pct:+.3f}%  "
            f"t={hr.t_vs_b0:+.2f}  p(BH)={hr.p_bh_vs_b0:.4f}  "
            f"n={hr.n_samples}  SR={hr.sharpe:.2f}  "
            f"hit={hr.hit_rate:.0%}  "
            f"CI=[{ci_lo:+.3f},{ci_hi:+.3f}]  {status}"
        )
        for gate in hr.gates:
            mark = "✓" if gate.passed else "✗"
            print(
                f"       {mark} {gate.gate_id:<8} {gate.name:<20} "
                f"{gate.value:.4f} ≥ {gate.threshold}"
            )
        print()

    verdict = "PROMOTE" if report.overall_pass_count > 0 else "REFINE / DEPRECATE"
    print(f"  Overall: {verdict}  ({report.overall_pass_count}/{len(report.horizon_reports)} horizons pass)")
    print(f"{'=' * width}\n")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Run Layer P statistical validation for a pattern slug."
    )
    parser.add_argument(
        "pattern_slug",
        nargs="?",
        help="e.g. tradoor-oi-reversal-v1",
    )
    parser.add_argument(
        "--horizon",
        type=int,
        default=4,
        help="Forward return horizon in hours (default: 4, per W-0289 D1)",
    )
    parser.add_argument(
        "--cost-bps",
        type=float,
        default=15.0,
        help="Round-trip cost in bps (default: 15, per W-0289 D2)",
    )
    parser.add_argument(
        "--n-trials",
        type=int,
        default=500,
        help="DSR selection-bias universe size (default: 500, per W-0286)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output raw JSON instead of human-readable report",
    )
    parser.add_argument(
        "--list-slugs",
        action="store_true",
        help="List available pattern slugs and exit",
    )
    args = parser.parse_args(argv)

    if args.list_slugs:
        _list_slugs()
        return

    if not args.pattern_slug:
        parser.error("pattern_slug is required unless --list-slugs is given")

    sys.exit(
        _run_offline(
            pattern_slug=args.pattern_slug,
            horizon=args.horizon,
            cost_bps=args.cost_bps,
            as_json=args.json,
            n_trials=args.n_trials,
        )
    )


if __name__ == "__main__":
    main()
