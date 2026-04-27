"""V-02 (W-0218) — Phase-Conditional Forward Return measurement (M1).

Implements W-0214 §3.2 M1 (Phase-conditional forward return). This module
extends ``pattern_search.py`` *via composition*: it calls the existing
``_measure_forward_peak_return`` primitive (peak return + realistic peak)
and adds a **mean return at exact horizon h** measurement that the legacy
function does not provide.

The horizon-mean return is the input that V-06 (W-0220) uses for Welch
t-test / DSR / BH gating, and that V-08 (W-0221) compares against the
random baseline (B0).

V-00 augment-only enforcement
-----------------------------
``engine/research/pattern_search.py`` is **read-only** for V-track work
(W-0214 §14.8). This module imports private helper
``_measure_forward_peak_return`` because the PRD calls it out by name
(W-0218 §6.1). N-3 (W-0225 §6.3) tracks promoting that helper to a
semi-public name via a separate ADR — that change is owned by the
pattern_search.py author, not by V-02.

W-0225 §6.1 C-1 cost double-counting fix
----------------------------------------
The original W-0218 PRD passed ``entry_slippage_pct=0.05`` to
``_measure_forward_peak_return`` *and* subtracted ``cost_bps=15`` from the
final return. Because ``_measure_forward_peak_return`` bakes the slippage
into ``entry_next_open`` (pattern_search.py L2737-2739), this would charge
20bps total — 5bps of slip twice.

Per W-0225 §6.1 Issue C-1, **Option A** is adopted:

* Pass ``entry_slippage_pct=0.0`` (no slip in entry price).
* Subtract ``cost_bps`` once (15bps default = 10bps fee + 5bps slip).

This keeps cost accounting in a single place and matches W-0214 D3
exactly (round-trip 15bps).
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime

import numpy as np
import pandas as pd

from data_cache.loader import CacheMiss, load_klines
from research.pattern_search import _measure_forward_peak_return

__all__ = [
    "PhaseConditionalReturn",
    "measure_phase_conditional_return",
    "measure_random_baseline",
]


@dataclass(frozen=True)
class PhaseConditionalReturn:
    """W-0214 §3.2 M1 measurement result for a single (pattern, phase, horizon).

    Attributes:
        pattern_slug: pattern identifier under measurement.
        phase_name: name of the phase whose entries are being evaluated.
        horizon_hours: forward window in hours. M1 spec uses {1, 4, 24}.
        cost_bps: round-trip cost in basis points subtracted from each
            sample. Default 15bps per W-0214 D3 (10bps fee + 5bps slip).

        n_samples: number of usable forward returns collected. Entries
            whose forward window runs past the cached klines, or whose
            ``_measure_forward_peak_return`` call returned ``None``, are
            dropped.
        mean_return_pct: mean of net forward returns at horizon h, in
            percent. ``return_at_h - cost_bps/100``.
        median_return_pct: median of the same.
        std_return_pct: standard deviation (population, ``ddof=0``).
        min_return_pct / max_return_pct: extrema across samples.

        mean_peak_return_pct: mean of the legacy ``paper_peak`` returns
            (peak inside horizon, entry = entry-bar close). cost_bps
            already subtracted. ``None`` when no entries produced a peak.
        realistic_mean_pct: mean of the legacy ``realistic_peak`` returns
            (peak inside horizon, entry = next-bar open). cost_bps
            subtracted. ``None`` when no entries produced a realistic
            peak.

        samples: frozen tuple of net horizon-mean returns. V-08 (W-0221)
            and V-06 (W-0220) read this for B0 baseline comparison and
            t-statistics.
    """

    pattern_slug: str
    phase_name: str
    horizon_hours: int
    cost_bps: float

    n_samples: int
    mean_return_pct: float
    median_return_pct: float
    std_return_pct: float
    min_return_pct: float
    max_return_pct: float

    mean_peak_return_pct: float | None
    realistic_mean_pct: float | None

    samples: tuple[float, ...]


def _empty_result(
    *,
    pattern_slug: str,
    phase_name: str,
    horizon_hours: int,
    cost_bps: float,
) -> PhaseConditionalReturn:
    """Return a PhaseConditionalReturn with n_samples=0 and zeroed stats."""
    return PhaseConditionalReturn(
        pattern_slug=pattern_slug,
        phase_name=phase_name,
        horizon_hours=horizon_hours,
        cost_bps=cost_bps,
        n_samples=0,
        mean_return_pct=0.0,
        median_return_pct=0.0,
        std_return_pct=0.0,
        min_return_pct=0.0,
        max_return_pct=0.0,
        mean_peak_return_pct=None,
        realistic_mean_pct=None,
        samples=(),
    )


def _compute_return_at_horizon(
    klines: pd.DataFrame,
    entry_ts: datetime,
    horizon_bars: int,
    entry_price: float,
) -> float | None:
    """Forward return at the *exact* horizon h (close-to-close, percent).

    Returns ``None`` when:
      * no klines bar at or after ``entry_ts``,
      * the bar at ``entry_pos + horizon_bars`` is past the end of the
        cached klines,
      * ``entry_price`` is non-positive.

    The ``entry_pos`` is the *first* bar whose timestamp is ``>= entry_ts``,
    matching ``_measure_forward_peak_return`` (pattern_search.py L2719).
    """
    if klines is None or klines.empty:
        return None
    if entry_price <= 0:
        return None
    if "close" not in klines.columns:
        return None

    entry_mask = klines.index >= entry_ts
    if not entry_mask.any():
        return None
    entry_pos = int(np.asarray(entry_mask).nonzero()[0][0])
    target_pos = entry_pos + horizon_bars
    if target_pos >= len(klines):
        return None

    target_close = float(klines.iloc[target_pos]["close"])
    return (target_close - entry_price) / entry_price * 100.0


def measure_phase_conditional_return(
    *,
    pattern_slug: str,
    phase_name: str,
    entry_timestamps: Iterable[datetime],
    symbol: str,
    timeframe: str,
    horizon_hours: int,
    cost_bps: float = 15.0,
    bars_per_hour: int = 1,
) -> PhaseConditionalReturn:
    """W-0214 §3.2 M1: forward return distribution at phase-k entries.

    For each entry timestamp the function computes:

      ``return_at_h = (close[t + h] - entry_price) / entry_price * 100``

    where ``entry_price`` is the next bar's open (realistic entry, no
    slippage) when available, falling back to the entry bar's close, and
    ``h = horizon_hours * bars_per_hour`` bars forward. The cost is then
    subtracted **once**:

      ``return_net = return_at_h - cost_bps / 100``

    See module docstring "W-0225 §6.1 C-1 cost double-counting fix" for
    why ``entry_slippage_pct`` is held at ``0.0`` and the cost is applied
    only here.

    Args:
        pattern_slug: pattern identifier.
        phase_name: phase whose entries are being measured.
        entry_timestamps: iterable of entry datetimes. Materialised once
            internally so a generator works.
        symbol: market symbol passed to ``load_klines``.
        timeframe: timeframe string (e.g. ``"1h"``) passed to
            ``load_klines``.
        horizon_hours: horizon h in hours. M1 spec uses {1, 4, 24}.
        cost_bps: round-trip cost in basis points. Default 15.0
            (W-0214 D3). Pass 0.0 for raw / no-cost measurements.
        bars_per_hour: number of bars per hour. Default 1 (1h timeframe).
            For 15m bars pass 4, for 4h bars pass ``1/4`` would not be
            integer-safe; callers should typically convert horizon at the
            call site instead.

    Returns:
        ``PhaseConditionalReturn``. When ``entry_timestamps`` is empty or
        every entry was unusable, returns a zero-filled result with
        ``n_samples == 0``.

    Raises:
        ValueError: when ``horizon_hours <= 0``, ``bars_per_hour <= 0``,
            or both yield ``horizon_bars <= 0``.
    """
    if horizon_hours <= 0:
        raise ValueError(f"horizon_hours must be positive, got {horizon_hours}")
    if bars_per_hour <= 0:
        raise ValueError(f"bars_per_hour must be positive, got {bars_per_hour}")
    horizon_bars = horizon_hours * bars_per_hour
    if horizon_bars <= 0:
        raise ValueError(
            f"horizon_bars must be positive, got {horizon_bars} "
            f"(horizon_hours={horizon_hours} * bars_per_hour={bars_per_hour})"
        )

    timestamps = list(entry_timestamps)
    if not timestamps:
        return _empty_result(
            pattern_slug=pattern_slug,
            phase_name=phase_name,
            horizon_hours=horizon_hours,
            cost_bps=cost_bps,
        )

    # Load klines once for the whole entry batch (perf budget §8.3).
    try:
        klines = load_klines(symbol, timeframe, offline=True)
    except (CacheMiss, ValueError, OSError):
        klines = None

    cost_pct = cost_bps / 100.0
    samples: list[float] = []
    samples_peak: list[float] = []
    samples_realistic: list[float] = []

    for entry_ts in timestamps:
        # Composition: pattern_search.py is the source of truth for entry
        # price + peak return semantics. W-0225 C-1 fix: entry_slippage_pct=0.0
        # so the cost is applied exactly once below.
        try:
            entry_close, peak_pct, entry_next_open, realistic_peak_pct = (
                _measure_forward_peak_return(
                    symbol=symbol,
                    timeframe=timeframe,
                    entry_ts=entry_ts,
                    horizon_bars=horizon_bars,
                    entry_slippage_pct=0.0,
                )
            )
        except Exception:
            # _measure_forward_peak_return swallows most errors and
            # returns (None, None, None, None), but stay defensive.
            continue

        if entry_close is None:
            continue

        # Mean at horizon h (V-02 extension). Prefer next-open as the
        # entry price (realistic), fall back to entry-bar close (paper).
        entry_price = entry_next_open if entry_next_open is not None else entry_close
        return_at_h = _compute_return_at_horizon(
            klines, entry_ts, horizon_bars, entry_price
        )
        if return_at_h is not None:
            samples.append(return_at_h - cost_pct)

        if peak_pct is not None:
            samples_peak.append(peak_pct - cost_pct)
        if realistic_peak_pct is not None:
            samples_realistic.append(realistic_peak_pct - cost_pct)

    if not samples:
        # Even if peak / realistic samples exist, M1 is defined by the
        # horizon-mean return — no horizon-mean samples means n_samples=0.
        return _empty_result(
            pattern_slug=pattern_slug,
            phase_name=phase_name,
            horizon_hours=horizon_hours,
            cost_bps=cost_bps,
        )

    arr = np.asarray(samples, dtype=float)
    return PhaseConditionalReturn(
        pattern_slug=pattern_slug,
        phase_name=phase_name,
        horizon_hours=horizon_hours,
        cost_bps=cost_bps,
        n_samples=len(samples),
        mean_return_pct=float(arr.mean()),
        median_return_pct=float(np.median(arr)),
        std_return_pct=float(arr.std()),
        min_return_pct=float(arr.min()),
        max_return_pct=float(arr.max()),
        mean_peak_return_pct=(
            float(np.mean(samples_peak)) if samples_peak else None
        ),
        realistic_mean_pct=(
            float(np.mean(samples_realistic)) if samples_realistic else None
        ),
        samples=tuple(samples),
    )


def measure_random_baseline(
    *,
    n_samples: int,
    symbol: str,
    timeframe: str,
    horizon_hours: int,
    cost_bps: float = 15.0,
    bars_per_hour: int = 1,
    seed: int = 42,
) -> PhaseConditionalReturn:
    """B0 random-time baseline (W-0214 §3.7 baseline, PRD §7.2).

    Samples ``n_samples`` random entry timestamps from the cached klines
    and runs ``measure_phase_conditional_return`` against them. Used by
    V-08 (W-0221) to compare ``measure_phase_conditional_return`` results
    against a same-cost, same-horizon random baseline.

    Args:
        n_samples: number of random entries to draw (without replacement
            when fewer than ``len(klines) - horizon_bars`` candidates,
            with replacement otherwise).
        symbol / timeframe / horizon_hours / cost_bps / bars_per_hour:
            forwarded to ``measure_phase_conditional_return``.
        seed: numpy random seed for reproducibility (default 42).

    Returns:
        ``PhaseConditionalReturn`` with ``pattern_slug='__random__'`` and
        ``phase_name='random'``. Empty result on cache miss.
    """
    if horizon_hours <= 0:
        raise ValueError(f"horizon_hours must be positive, got {horizon_hours}")
    if bars_per_hour <= 0:
        raise ValueError(f"bars_per_hour must be positive, got {bars_per_hour}")
    if n_samples <= 0:
        return _empty_result(
            pattern_slug="__random__",
            phase_name="random",
            horizon_hours=horizon_hours,
            cost_bps=cost_bps,
        )

    horizon_bars = horizon_hours * bars_per_hour
    try:
        klines = load_klines(symbol, timeframe, offline=True)
    except (CacheMiss, ValueError, OSError):
        return _empty_result(
            pattern_slug="__random__",
            phase_name="random",
            horizon_hours=horizon_hours,
            cost_bps=cost_bps,
        )
    if klines is None or klines.empty or len(klines) <= horizon_bars + 1:
        return _empty_result(
            pattern_slug="__random__",
            phase_name="random",
            horizon_hours=horizon_hours,
            cost_bps=cost_bps,
        )

    rng = np.random.default_rng(seed)
    candidates = len(klines) - horizon_bars - 1
    replace = n_samples > candidates
    indices = rng.choice(candidates, size=n_samples, replace=replace)
    timestamps = [klines.index[int(i)].to_pydatetime() for i in indices]

    return measure_phase_conditional_return(
        pattern_slug="__random__",
        phase_name="random",
        entry_timestamps=timestamps,
        symbol=symbol,
        timeframe=timeframe,
        horizon_hours=horizon_hours,
        cost_bps=cost_bps,
        bars_per_hour=bars_per_hour,
    )
