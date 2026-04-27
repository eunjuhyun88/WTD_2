"""V-track integration acceptance — runs V-01/V-04/V-06 against real
benchmark_packs and a synthetic-but-realistic harness for V-02 (no kline
cache available in this worktree). Produces a markdown acceptance report.

Usage:
    cd engine && .venv/bin/python -m research.validation.acceptance_report

The script is idempotent and read-only against repo data. It prints a
human-readable report to stdout and exits non-zero if any acceptance
threshold (latency, no-inf, no-overlap) is violated.
"""

from __future__ import annotations

import gc
import glob
import json
import math
import statistics
import time
import tracemalloc
from pathlib import Path
from typing import Any

import numpy as np

import pandas as pd

from research.validation.cv import PurgedKFold, PurgedKFoldConfig
from research.validation.sequence import (
    SequenceCompletionResult,
    measure_sequence_completion,
)
from research.validation.stats import (
    bootstrap_ci,
    deflated_sharpe,
    hit_rate,
    profit_factor,
)


# ---------------------------------------------------------------------------
# 1. V-04 sequence completion against real benchmark_packs
# ---------------------------------------------------------------------------


def _v04_real_data_acceptance() -> dict[str, Any]:
    """Load all benchmark_packs and run measure_sequence_completion for each
    case under three realistic perturbations: exact, dwell, and shuffled.

    Returns a dict with case counts, latency stats, and pass/fail flags.
    """
    pack_dir = Path("research/pattern_search/benchmark_packs")
    pack_files = sorted(pack_dir.glob("*.json"))
    cases: list[dict[str, Any]] = []
    for pf in pack_files:
        with pf.open() as fp:
            pack = json.load(fp)
        for case in pack.get("cases", []):
            cases.append(
                {
                    "pattern_slug": pack["pattern_slug"],
                    "case_id": case["case_id"],
                    "expected_path": list(case["expected_path_flag"])
                    if "expected_path_flag" in case
                    else list(case["expected_phase_path"]),
                }
            )
    assert cases, "no benchmark cases found"

    timings: list[float] = []
    g6_pass_exact = 0
    g6_pass_dwell = 0
    g6_pass_shuffled = 0
    completion_exact_sum = 0.0
    completion_shuffled_sum = 0.0

    for c in cases:
        expected = c["expected_path"]
        # 1. exact replay
        t0 = time.perf_counter()
        r_exact: SequenceCompletionResult = measure_sequence_completion(
            pattern_slug=c["pattern_slug"],
            expected_path=expected,
            observed_path=expected,
            phase_attempts=[],
            current_phase=expected[-1],
        )
        # 2. dwell — duplicate first phase
        observed_dwell = [expected[0], expected[0], *expected[1:]]
        r_dwell = measure_sequence_completion(
            pattern_slug=c["pattern_slug"],
            expected_path=expected,
            observed_path=observed_dwell,
            phase_attempts=[],
            current_phase=expected[-1],
        )
        # 3. shuffled — reverse last two
        if len(expected) >= 2:
            observed_shuf = [*expected[:-2], expected[-1], expected[-2]]
        else:
            observed_shuf = list(expected)
        r_shuf = measure_sequence_completion(
            pattern_slug=c["pattern_slug"],
            expected_path=expected,
            observed_path=observed_shuf,
            phase_attempts=[],
            current_phase=expected[-1],
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000
        timings.append(elapsed_ms)

        if r_exact.monotonic_violation_count == 0:
            g6_pass_exact += 1
        if r_dwell.monotonic_violation_count == 0:
            g6_pass_dwell += 1
        if r_shuf.monotonic_violation_count == 0:
            g6_pass_shuffled += 1
        completion_exact_sum += r_exact.completion_rate
        completion_shuffled_sum += r_shuf.completion_rate

    avg_latency_ms = statistics.mean(timings)
    p95_latency_ms = sorted(timings)[int(0.95 * len(timings))]
    max_latency_ms = max(timings)

    return {
        "n_packs": len(pack_files),
        "n_cases": len(cases),
        "g6_pass_exact": g6_pass_exact,
        "g6_pass_dwell": g6_pass_dwell,
        "g6_pass_shuffled": g6_pass_shuffled,
        "avg_completion_exact": completion_exact_sum / len(cases),
        "avg_completion_shuffled": completion_shuffled_sum / len(cases),
        "avg_latency_ms_per_3calls": avg_latency_ms,
        "p95_latency_ms_per_3calls": p95_latency_ms,
        "max_latency_ms_per_3calls": max_latency_ms,
        "perf_budget_pass": max_latency_ms < 100.0,
    }


# ---------------------------------------------------------------------------
# 2. V-06 stats acceptance — realistic samples, JSON-safe profit_factor
# ---------------------------------------------------------------------------


def _v06_acceptance() -> dict[str, Any]:
    rng = np.random.default_rng(42)
    # realistic returns: 1000 samples mean=0.3% std=2.5% (crypto perp daily)
    samples = rng.normal(0.003, 0.025, size=1000).tolist()

    t0 = time.perf_counter()
    boot = bootstrap_ci(samples, n_iter=10_000, seed=42)
    bootstrap_ms = (time.perf_counter() - t0) * 1000
    # bootstrap_ci returns tuple (lower, upper, point_estimate)
    boot_low, boot_high, boot_point = boot

    t0 = time.perf_counter()
    dsr_realistic = deflated_sharpe(samples, n_trials=2000)
    dsr_ms = (time.perf_counter() - t0) * 1000

    pf = profit_factor(samples)
    pf_all_pos = profit_factor([0.01, 0.02, 0.03])  # N-1 cap test
    hr = hit_rate(samples)

    # JSON safety check (W-0225 N-1)
    payload = {"pf": pf, "pf_all_pos": pf_all_pos, "dsr": dsr_realistic, "hit_rate": hr}
    json_safe = True
    try:
        json.dumps(payload)
    except (ValueError, TypeError):
        json_safe = False

    return {
        "samples_n": len(samples),
        "bootstrap_point": boot_point,
        "bootstrap_ci_low": boot_low,
        "bootstrap_ci_high": boot_high,
        "bootstrap_ms_for_10k_iter": bootstrap_ms,
        "dsr_realistic_n_trials_2000": dsr_realistic,
        "dsr_ms": dsr_ms,
        "profit_factor_normal": pf,
        "profit_factor_all_positive_capped": pf_all_pos,
        "n1_cap_pass": pf_all_pos == 999.0 and not math.isinf(pf_all_pos),
        "hit_rate": hr,
        "json_serializable": json_safe,
        "perf_budget_bootstrap_ms": bootstrap_ms < 1000,
    }


# ---------------------------------------------------------------------------
# 3. V-01 PurgedKFold acceptance — split coverage + no leak
# ---------------------------------------------------------------------------


def _v01_acceptance() -> dict[str, Any]:
    n = 1000
    # 1h-bar synthetic time index
    index = pd.date_range("2024-01-01", periods=n, freq="1h", tz="UTC")
    cfg = PurgedKFoldConfig(
        n_splits=5,
        label_horizon_hours=4,
        embargo_floor_pct=0.01,
        bars_per_hour=1,
    )
    cv = PurgedKFold(cfg)
    timings: list[float] = []
    leak_count = 0
    train_total = 0
    test_total = 0
    n_folds = 0
    t_split0 = time.perf_counter()
    for fold_idx, (train_idx, test_idx) in enumerate(cv.split(index)):
        n_folds += 1
        # check no train/test overlap (leak detection)
        train_set = set(int(x) for x in train_idx)
        test_set = set(int(x) for x in test_idx)
        if train_set & test_set:
            leak_count += 1
        train_total += len(train_idx)
        test_total += len(test_idx)
        timings.append(0.0)  # per-fold timing not separately measured here
    total_split_ms = (time.perf_counter() - t_split0) * 1000

    return {
        "n_samples": n,
        "n_splits_yielded": n_folds,
        "leak_count": leak_count,
        "avg_train_size": train_total / max(n_folds, 1),
        "avg_test_size": test_total / max(n_folds, 1),
        "total_split_ms": total_split_ms,
        "no_leak_pass": leak_count == 0,
    }


# ---------------------------------------------------------------------------
# 4. V-02 phase_eval — synthetic mock (no kline cache in worktree)
# ---------------------------------------------------------------------------


def _v02_real_data_acceptance() -> dict[str, Any]:
    """V-02 real-data acceptance: load benchmark_packs, run
    measure_phase_conditional_return against real cached klines (the
    cache lives in the parent repo and is auto-resolved by
    `data_cache.loader`).

    For each case we use the case's `start_at` as the BREAKOUT entry and
    measure forward return at horizons 4h and 24h with cost_bps=15.
    """
    from datetime import datetime

    from data_cache.loader import load_klines
    from research.validation.phase_eval import (
        PhaseConditionalReturn,
        measure_phase_conditional_return,
    )

    pack_dir = Path("research/pattern_search/benchmark_packs")
    pack_files = sorted(pack_dir.glob("*.json"))

    # collect (symbol, ts, pattern, phase_name) from all 12 packs
    entries_by_symbol: dict[tuple[str, str], list[datetime]] = {}
    pattern_for: dict[tuple[str, str], str] = {}
    phase_for: dict[tuple[str, str], str] = {}
    for pf in pack_files:
        with pf.open() as fp:
            pack = json.load(fp)
        for case in pack.get("cases", []):
            sym = case["symbol"]
            tf = case["timeframe"]
            phases = case.get("expected_phase_path") or []
            entry_phase = phases[-1] if phases else "BREAKOUT"
            ts = datetime.fromisoformat(case["start_at"])
            key = (sym, tf)
            entries_by_symbol.setdefault(key, []).append(ts)
            pattern_for[key] = pack["pattern_slug"]
            phase_for[key] = entry_phase

    # filter to symbol/tf combos for which we have a kline cache
    runnable: list[tuple[str, str]] = []
    for key in entries_by_symbol:
        sym, tf = key
        try:
            df = load_klines(sym, tf, offline=True)
            if len(df) > 0:
                runnable.append(key)
        except Exception:
            continue

    timings_4h: list[float] = []
    timings_24h: list[float] = []
    n_entries_total = 0
    n_results_4h = 0
    n_results_24h = 0
    cost_pct_observed: list[float] = []

    for key in runnable:
        sym, tf = key
        ts_list = entries_by_symbol[key]
        n_entries_total += len(ts_list)
        # h = 4
        t0 = time.perf_counter()
        r4: PhaseConditionalReturn = measure_phase_conditional_return(
            pattern_slug=pattern_for[key],
            phase_name=phase_for[key],
            entry_timestamps=ts_list,
            symbol=sym,
            timeframe=tf,
            horizon_hours=4,
            cost_bps=15.0,
        )
        timings_4h.append((time.perf_counter() - t0) * 1000)
        if r4.n_samples > 0:
            n_results_4h += r4.n_samples

        # h = 24
        t0 = time.perf_counter()
        r24 = measure_phase_conditional_return(
            pattern_slug=pattern_for[key],
            phase_name=phase_for[key],
            entry_timestamps=ts_list,
            symbol=sym,
            timeframe=tf,
            horizon_hours=24,
            cost_bps=15.0,
        )
        timings_24h.append((time.perf_counter() - t0) * 1000)
        if r24.n_samples > 0:
            n_results_24h += r24.n_samples

        # cost-fix evidence: re-measure with cost_bps=0 and compute
        # delta == 0.15% per the W-0225 C-1 fix.
        r4_zero = measure_phase_conditional_return(
            pattern_slug=pattern_for[key],
            phase_name=phase_for[key],
            entry_timestamps=ts_list,
            symbol=sym,
            timeframe=tf,
            horizon_hours=4,
            cost_bps=0.0,
        )
        if r4.n_samples > 0 and r4_zero.n_samples == r4.n_samples:
            # mean_return_net difference must equal exactly cost_bps/100 = 0.15%
            delta = r4_zero.mean_return_pct - r4.mean_return_pct
            cost_pct_observed.append(delta)

    avg_cost_delta = (
        sum(cost_pct_observed) / len(cost_pct_observed)
        if cost_pct_observed
        else float("nan")
    )

    return {
        "n_packs_with_klines_cache": len(runnable),
        "n_entries_attempted": n_entries_total,
        "n_results_h4": n_results_4h,
        "n_results_h24": n_results_24h,
        "max_latency_ms_h4": max(timings_4h) if timings_4h else 0,
        "max_latency_ms_h24": max(timings_24h) if timings_24h else 0,
        "avg_latency_ms_h4": (sum(timings_4h) / len(timings_4h)) if timings_4h else 0,
        "c1_cost_delta_observed_pct": avg_cost_delta,
        "c1_cost_fix_pass": (
            len(cost_pct_observed) > 0
            and abs(avg_cost_delta - 0.15) < 1e-6
        ),
        "perf_budget_ok_h4": (
            (max(timings_4h) if timings_4h else 0) < 5000
        ),
    }


# ---------------------------------------------------------------------------
# Main entry
# ---------------------------------------------------------------------------


def main() -> int:
    gc.collect()
    tracemalloc.start()
    snap0 = tracemalloc.take_snapshot()

    print("# V-track Integration Acceptance Report\n")

    print("## V-04 Sequence Completion (real benchmark_packs)\n")
    v04 = _v04_real_data_acceptance()
    for k, v in v04.items():
        print(f"- **{k}**: {v}")

    print("\n## V-06 Stats Engine (realistic 1000 samples)\n")
    v06 = _v06_acceptance()
    for k, v in v06.items():
        print(f"- **{k}**: {v}")

    print("\n## V-01 PurgedKFold (synthetic 1000-period series)\n")
    v01 = _v01_acceptance()
    for k, v in v01.items():
        print(f"- **{k}**: {v}")

    print("\n## V-02 phase_eval (REAL klines from data_cache parent-repo cache)\n")
    v02 = _v02_real_data_acceptance()
    for k, v in v02.items():
        print(f"- **{k}**: {v}")

    snap1 = tracemalloc.take_snapshot()
    diff = snap1.compare_to(snap0, "filename")
    total_kb = sum(s.size_diff for s in diff) / 1024
    print(f"\n## Memory delta: **{total_kb:.1f} KB** (tracemalloc)\n")

    # acceptance gates
    failures: list[str] = []
    if not v04["perf_budget_pass"]:
        failures.append(f"V-04 perf budget exceeded (max {v04['max_latency_ms_per_3calls']:.1f}ms)")
    if not v06["json_serializable"]:
        failures.append("V-06 profit_factor returned non-JSON-safe value (N-1 violation)")
    if not v06["n1_cap_pass"]:
        failures.append("V-06 N-1 cap not enforced")
    if not v06["perf_budget_bootstrap_ms"]:
        failures.append(f"V-06 bootstrap perf exceeded 1s ({v06['bootstrap_ms_for_10k_iter']:.0f}ms)")
    if not v01["no_leak_pass"]:
        failures.append(f"V-01 train/test leak detected ({v01['leak_count']} folds)")
    if v02.get("n_packs_with_klines_cache", 0) == 0:
        failures.append("V-02 no real-kline cases runnable")
    if not v02.get("c1_cost_fix_pass", False):
        failures.append(
            f"V-02 W-0225 C-1 cost-fix violation — observed Δ={v02.get('c1_cost_delta_observed_pct')!r}, expected 0.15"
        )
    if not v02.get("perf_budget_ok_h4", False):
        failures.append(
            f"V-02 perf budget exceeded ({v02.get('max_latency_ms_h4'):.0f} ms)"
        )

    if failures:
        print("## ❌ ACCEPTANCE FAILURES\n")
        for f in failures:
            print(f"- {f}")
        return 1
    print("## ✅ All acceptance gates passed\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
