"""V-08 baselines — B0~B3 for pipeline.py (W-0221).

B0: random-time (delegates to phase_eval.measure_random_baseline)
B1: buy & hold — forward return with no entry signal, no slippage
B2: phase-zero miss — entries where the pattern started but phase 0 was not hit
B3: previous-phase stub — TODO (PhaseAttemptSummary is not PhaseConditionalReturn)

All functions return a :class:`~research.validation.phase_eval.PhaseConditionalReturn`
so pipeline.py can treat all baselines uniformly for t-test comparison.

V-00 augment-only: ``engine/research/pattern_search.py`` is READ-ONLY
(W-0214 §14.8). B0 delegates to phase_eval; B1/B2 use BenchmarkCase data
from the pack; B3 is a stub that returns an empty result.
"""

from __future__ import annotations

from datetime import datetime

import numpy as np

from data_cache.loader import CacheMiss, load_klines
from research.pattern_search import ReplayBenchmarkPack
from research.validation.phase_eval import (
    PhaseConditionalReturn,
    _empty_result,
    measure_random_baseline,
)

__all__ = [
    "measure_b0_random",
    "measure_b1_buy_hold",
    "measure_b2_phase_zero",
    "measure_b3_phase_k_minus_1",
]


def measure_b0_random(
    *,
    n_samples: int,
    pack: ReplayBenchmarkPack,
    horizon_hours: int,
    cost_bps: float = 15.0,
    bars_per_hour: int = 1,
    seed: int = 42,
) -> PhaseConditionalReturn:
    """B0 random-time baseline.

    Delegates to :func:`~research.validation.phase_eval.measure_random_baseline`
    using the first symbol and timeframe from the pack's cases. If the pack
    has no cases, returns an empty result.

    Args:
        n_samples: number of random entries to draw.
        pack: :class:`ReplayBenchmarkPack` supplying symbol + timeframe.
        horizon_hours: forward horizon in hours.
        cost_bps: round-trip cost in basis points. Default 15.0 (W-0214 D3).
        bars_per_hour: bars per hour for the timeframe. Default 1.
        seed: numpy random seed for reproducibility.

    Returns:
        ``PhaseConditionalReturn`` with ``pattern_slug='__random__'``.
    """
    if not pack.cases:
        return _empty_result(
            pattern_slug="__random__",
            phase_name="random",
            horizon_hours=horizon_hours,
            cost_bps=cost_bps,
        )
    # Use the first reference case for symbol + timeframe.
    first_case = pack.cases[0]
    return measure_random_baseline(
        n_samples=n_samples,
        symbol=first_case.symbol,
        timeframe=first_case.timeframe,
        horizon_hours=horizon_hours,
        cost_bps=cost_bps,
        bars_per_hour=bars_per_hour,
        seed=seed,
    )


def measure_b1_buy_hold(
    *,
    pack: ReplayBenchmarkPack,
    horizon_hours: int,
    cost_bps: float = 15.0,
    bars_per_hour: int = 1,
) -> PhaseConditionalReturn:
    """B1 buy-and-hold baseline.

    For each BenchmarkCase in the pack, enters at the first bar of the case
    window (case.start_at) and measures the forward return at
    ``horizon_hours * bars_per_hour`` bars. No entry-signal filtering — pure
    buy & hold. Cost is subtracted once per the W-0225 C-1 convention.

    Args:
        pack: :class:`ReplayBenchmarkPack`.
        horizon_hours: forward horizon in hours.
        cost_bps: round-trip cost in basis points.
        bars_per_hour: bars per hour.

    Returns:
        ``PhaseConditionalReturn`` with ``pattern_slug='__buy_hold__'``.
    """
    horizon_bars = horizon_hours * bars_per_hour
    cost_pct = cost_bps / 100.0
    samples: list[float] = []

    for case in pack.cases:
        try:
            klines = load_klines(case.symbol, case.timeframe, offline=True)
        except (CacheMiss, ValueError, OSError):
            continue
        if klines is None or klines.empty:
            continue
        if "close" not in klines.columns:
            continue

        entry_ts: datetime = case.start_at
        entry_mask = klines.index >= entry_ts
        if not entry_mask.any():
            continue
        entry_pos = int(np.asarray(entry_mask).nonzero()[0][0])
        target_pos = entry_pos + horizon_bars
        if target_pos >= len(klines):
            continue

        entry_price = float(klines.iloc[entry_pos]["close"])
        target_close = float(klines.iloc[target_pos]["close"])
        if entry_price <= 0:
            continue

        ret = (target_close - entry_price) / entry_price * 100.0 - cost_pct
        samples.append(ret)

    if not samples:
        return _empty_result(
            pattern_slug="__buy_hold__",
            phase_name="buy_hold",
            horizon_hours=horizon_hours,
            cost_bps=cost_bps,
        )

    arr = np.asarray(samples, dtype=float)
    return PhaseConditionalReturn(
        pattern_slug="__buy_hold__",
        phase_name="buy_hold",
        horizon_hours=horizon_hours,
        cost_bps=cost_bps,
        n_samples=len(samples),
        mean_return_pct=float(arr.mean()),
        median_return_pct=float(np.median(arr)),
        std_return_pct=float(arr.std()),
        min_return_pct=float(arr.min()),
        max_return_pct=float(arr.max()),
        mean_peak_return_pct=None,
        realistic_mean_pct=None,
        samples=tuple(samples),
    )


def measure_b2_phase_zero(
    *,
    pack: ReplayBenchmarkPack,
    horizon_hours: int,
    cost_bps: float = 15.0,
    bars_per_hour: int = 1,
) -> PhaseConditionalReturn:
    """B2 phase-zero miss baseline.

    Provides a baseline for cases where the pattern started but the first
    phase (index 0 in ``expected_phase_path``) was not reached. Uses the
    case start time as the entry timestamp and measures the forward return
    at ``horizon_hours`` — this represents the "no-entry, watch only" cost.

    Implementation note: the actual phase-hit boolean is not tracked in
    ``BenchmarkCase`` (the field does not exist). Instead, this function
    uses cases whose ``expected_phase_path`` is non-empty as proxies for
    "initiated" patterns, then measures from case start. The resulting
    distribution represents background market drift, not true missed entries.
    Callers should interpret B2 accordingly.

    Args:
        pack: :class:`ReplayBenchmarkPack`.
        horizon_hours: forward horizon in hours.
        cost_bps: round-trip cost in basis points.
        bars_per_hour: bars per hour.

    Returns:
        ``PhaseConditionalReturn`` with ``pattern_slug='__phase_zero_miss__'``.
    """
    horizon_bars = horizon_hours * bars_per_hour
    cost_pct = cost_bps / 100.0
    samples: list[float] = []

    for case in pack.cases:
        # Use cases with a defined phase path (initiated patterns only).
        if not case.expected_phase_path:
            continue
        try:
            klines = load_klines(case.symbol, case.timeframe, offline=True)
        except (CacheMiss, ValueError, OSError):
            continue
        if klines is None or klines.empty:
            continue
        if "close" not in klines.columns:
            continue

        entry_ts: datetime = case.start_at
        entry_mask = klines.index >= entry_ts
        if not entry_mask.any():
            continue
        entry_pos = int(np.asarray(entry_mask).nonzero()[0][0])
        target_pos = entry_pos + horizon_bars
        if target_pos >= len(klines):
            continue

        entry_price = float(klines.iloc[entry_pos]["close"])
        target_close = float(klines.iloc[target_pos]["close"])
        if entry_price <= 0:
            continue

        ret = (target_close - entry_price) / entry_price * 100.0 - cost_pct
        samples.append(ret)

    if not samples:
        return _empty_result(
            pattern_slug="__phase_zero_miss__",
            phase_name="phase_zero_miss",
            horizon_hours=horizon_hours,
            cost_bps=cost_bps,
        )

    arr = np.asarray(samples, dtype=float)
    return PhaseConditionalReturn(
        pattern_slug="__phase_zero_miss__",
        phase_name="phase_zero_miss",
        horizon_hours=horizon_hours,
        cost_bps=cost_bps,
        n_samples=len(samples),
        mean_return_pct=float(arr.mean()),
        median_return_pct=float(np.median(arr)),
        std_return_pct=float(arr.std()),
        min_return_pct=float(arr.min()),
        max_return_pct=float(arr.max()),
        mean_peak_return_pct=None,
        realistic_mean_pct=None,
        samples=tuple(samples),
    )


def measure_b3_phase_k_minus_1(
    *,
    pack: ReplayBenchmarkPack,
    horizon_hours: int,
    cost_bps: float = 15.0,
) -> PhaseConditionalReturn:
    """B3 previous-phase baseline stub.

    ``summarize_phase_attempt_records`` returns a :class:`PhaseAttemptSummary`
    (failed_reason / missing_block counts), not a sample distribution. A
    compatible ``PhaseConditionalReturn`` cannot be derived without ledger
    records and entry timestamps, which are not part of
    :class:`ReplayBenchmarkPack`.

    This function is a **stub** that returns an empty result. V-08 pipeline
    skips B3 unless explicitly included in ``ValidationPipelineConfig.baselines``
    and a caller-supplied sample array is provided via a future extension.

    TODO (W-0221 follow-up): Accept ``phase_attempts: list[PatternLedgerRecord]``
    and derive per-phase entry timestamps from attempt records, then call
    ``measure_phase_conditional_return`` for the preceding phase.

    Returns:
        Empty ``PhaseConditionalReturn`` with ``pattern_slug='__phase_k_minus_1__'``.
    """
    return _empty_result(
        pattern_slug="__phase_k_minus_1__",
        phase_name="phase_k_minus_1",
        horizon_hours=horizon_hours,
        cost_bps=cost_bps,
    )
