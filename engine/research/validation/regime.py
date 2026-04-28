"""V-05 (W-0223) — Regime-conditional Return (M4).

Implements W-0214 §3.2 M4 + §3.7 G7:
BTC 30-day return regime labelling (BULL / BEAR / RANGE) and per-regime
M1 measurement.  Gate G7 fires when a pattern is active in at least one
regime but inactive in at least one other (regime-conditional behaviour).

W-0290 Phase 1 augment: classify_regime() adds high_vol / low_vol axis
(orthogonal to bull/bear/range). Existing function signatures preserved.

Dependencies:
    V-02 :func:`~research.validation.phase_eval.measure_phase_conditional_return`
    V-06 :mod:`~research.validation.stats`

V-00 augment-only: ``engine/research/pattern_search.py`` is NOT modified.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field
from enum import Enum
from typing import Sequence

import numpy as np


# ---------------------------------------------------------------------------
# RegimeLabel
# ---------------------------------------------------------------------------


class RegimeLabel(str, Enum):
    """BTC 30-day return regime label."""

    BULL = "bull"
    BEAR = "bear"
    RANGE = "range"


def label_regime(btc_return_30d_pct: float) -> RegimeLabel:
    """Label a BTC regime from a 30-day return percentage.

    Args:
        btc_return_30d_pct: BTC 30-day percentage return (e.g. ``12.5`` for
            +12.5 %).

    Returns:
        :attr:`RegimeLabel.BULL`  if return > +10 %
        :attr:`RegimeLabel.BEAR`  if return < -10 %
        :attr:`RegimeLabel.RANGE` otherwise
    """
    if btc_return_30d_pct > 10.0:
        return RegimeLabel.BULL
    if btc_return_30d_pct < -10.0:
        return RegimeLabel.BEAR
    return RegimeLabel.RANGE


# ---------------------------------------------------------------------------
# W-0290 Phase 1: 5-label vol axis (orthogonal to BULL/BEAR/RANGE)
# ---------------------------------------------------------------------------


class VolLabel(str, Enum):
    """Realized volatility label derived from recent 30-bar log returns."""

    HIGH_VOL = "high_vol"
    NORMAL_VOL = "normal_vol"
    LOW_VOL = "low_vol"


def classify_regime(
    closes: Sequence[float],
    *,
    vol_window: int = 30,
    high_vol_pct: float = 75.0,
    low_vol_pct: float = 25.0,
) -> tuple[RegimeLabel, VolLabel]:
    """Classify both trend-regime and vol-regime from a close-price series.

    The trend regime is derived from the 30-bar return of the last bar.
    The vol regime uses realized vol (std of log returns over ``vol_window``
    bars) compared to 25th/75th percentile thresholds computed from the
    full series.

    Existing callers of :func:`label_regime` are unaffected — this function
    is additive only.

    Args:
        closes: sequence of close prices (chronological order).
        vol_window: number of bars for realized vol computation (default 30).
        high_vol_pct: percentile threshold for HIGH_VOL (default 75).
        low_vol_pct: percentile threshold for LOW_VOL (default 25).

    Returns:
        ``(RegimeLabel, VolLabel)`` tuple.
    """
    arr = np.asarray(closes, dtype=float)
    n = len(arr)

    # Trend regime: use last vol_window bars' cumulative return
    if n >= 2:
        lookback = min(vol_window, n - 1)
        pct_return = (arr[-1] / arr[-1 - lookback] - 1.0) * 100.0
    else:
        pct_return = 0.0
    trend = label_regime(pct_return)

    # Vol regime: rolling realized vol for entire series, compare last window
    if n < 2:
        return trend, VolLabel.NORMAL_VOL

    log_returns = np.diff(np.log(arr[arr > 0]))
    if len(log_returns) < 2:
        return trend, VolLabel.NORMAL_VOL

    # Rolling std of log returns (window = vol_window bars)
    if len(log_returns) >= vol_window:
        windows = np.lib.stride_tricks.sliding_window_view(log_returns, vol_window)
        rolling_vols = windows.std(axis=1, ddof=1)
    else:
        rolling_vols = np.array([log_returns.std(ddof=1)])

    current_vol = rolling_vols[-1]
    p75 = float(np.percentile(rolling_vols, high_vol_pct))
    p25 = float(np.percentile(rolling_vols, low_vol_pct))

    if current_vol > p75:
        vol_label = VolLabel.HIGH_VOL
    elif current_vol < p25:
        vol_label = VolLabel.LOW_VOL
    else:
        vol_label = VolLabel.NORMAL_VOL

    return trend, vol_label


# ---------------------------------------------------------------------------
# Per-regime result
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RegimeConditionalReturn:
    """M1 measurement result for a single regime.

    Attributes:
        regime: The regime this result covers.
        mean_return: Mean forward return for entries in this regime.
        t_stat: One-sample t-statistic (mean / SE).
        n: Number of observations.
        passes: ``True`` when ``t_stat >= t_threshold``.
    """

    regime: RegimeLabel
    mean_return: float
    t_stat: float
    n: int
    passes: bool


# ---------------------------------------------------------------------------
# Gate result
# ---------------------------------------------------------------------------


@dataclass
class RegimeGateResult:
    """Aggregated regime-conditional gate evaluation.

    Attributes:
        per_regime: Mapping of each regime to its :class:`RegimeConditionalReturn`.
        active_regimes: Regimes where ``passes=True``.
        inactive_regimes: Regimes where ``t_stat <= t_neg_threshold``.
        g7_pass: ``True`` when active in **some** but **not all** regimes
            (regime-conditional pattern).  ``False`` when active in all
            regimes (regime-agnostic) or none.
    """

    per_regime: dict[RegimeLabel, RegimeConditionalReturn] = field(
        default_factory=dict
    )
    active_regimes: list[RegimeLabel] = field(default_factory=list)
    inactive_regimes: list[RegimeLabel] = field(default_factory=list)
    g7_pass: bool = False


# ---------------------------------------------------------------------------
# Core measurement function
# ---------------------------------------------------------------------------


def measure_regime_conditional_return(
    returns_by_regime: dict[RegimeLabel, Sequence[float]],
    *,
    t_threshold: float = 2.0,
    t_neg_threshold: float = 0.0,
) -> RegimeGateResult:
    """Measure per-regime M1 returns and evaluate the G7 regime gate.

    Args:
        returns_by_regime: Mapping from :class:`RegimeLabel` to a sequence
            of observed forward returns (e.g. ``{RegimeLabel.BULL: [0.02,
            0.03, ...]}``.
        t_threshold: t-statistic threshold for a regime to be "active"
            (default 2.0, matching G1).
        t_neg_threshold: t-statistic threshold below which a regime is
            labelled "inactive" (default 0.0).

    Returns:
        :class:`RegimeGateResult` with per-regime stats and G7 gate decision.

    Notes:
        * Regimes with fewer than 2 observations cannot compute a standard
          deviation; they receive ``t_stat=0.0`` and ``passes=False``.
        * Zero-variance samples (all returns identical) also yield
          ``t_stat=0.0`` to avoid division by zero.
    """
    per_regime: dict[RegimeLabel, RegimeConditionalReturn] = {}

    for regime, rets in returns_by_regime.items():
        rets_list = list(rets)
        n = len(rets_list)

        if n < 2:
            per_regime[regime] = RegimeConditionalReturn(
                regime=regime,
                mean_return=statistics.mean(rets_list) if n == 1 else 0.0,
                t_stat=0.0,
                n=n,
                passes=False,
            )
            continue

        mean = statistics.mean(rets_list)
        std = statistics.stdev(rets_list)

        if std == 0.0:
            t_stat = 0.0
        else:
            t_stat = mean / (std / math.sqrt(n))

        per_regime[regime] = RegimeConditionalReturn(
            regime=regime,
            mean_return=mean,
            t_stat=t_stat,
            n=n,
            passes=t_stat >= t_threshold,
        )

    active = [r for r, v in per_regime.items() if v.passes]
    inactive = [r for r, v in per_regime.items() if v.t_stat <= t_neg_threshold]

    # G7: regime-conditional = at least one regime active, at least one not
    total = len(per_regime)
    g7_pass = 0 < len(active) < total

    return RegimeGateResult(
        per_regime=per_regime,
        active_regimes=active,
        inactive_regimes=inactive,
        g7_pass=g7_pass,
    )
