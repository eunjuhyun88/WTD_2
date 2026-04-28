"""W-0290 Phase 2 — Robustness checks (4-axis split).

Splits net return samples along 4 axes and reports whether the edge is
consistent across partitions.  A pattern that only works in one slice of
time / symbols / volatility / cap group is not robust.

Axes:
  1. Time       — first half vs second half of the sample
  2. Symbol     — by cap_group (mega/large/mid/small)
  3. Volatility — high-vol vs low-vol entries (split at median realized vol)
  4. Cap group  — explicit symbol taxonomy (requires cap_group labels)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence, Literal

import numpy as np

from research.validation.stats import hit_rate, profit_factor


CapGroup = Literal["mega", "large", "mid", "small", "micro", "unknown"]


@dataclass
class AxisSlice:
    """Result for one slice of one robustness axis."""

    axis: str          # e.g. "time", "symbol", "volatility", "cap_group"
    label: str         # e.g. "first_half", "high_vol", "large"
    n: int
    mean_net_bps: float
    hit_rate: float
    profit_factor: float
    passed: bool       # mean_net_bps > 0


@dataclass
class RobustnessResult:
    """Aggregate robustness result for a pattern × horizon."""

    horizon_hours: int
    slices: list[AxisSlice] = field(default_factory=list)

    @property
    def axes_tested(self) -> list[str]:
        seen: list[str] = []
        for s in self.slices:
            if s.axis not in seen:
                seen.append(s.axis)
        return seen

    def slices_for_axis(self, axis: str) -> list[AxisSlice]:
        return [s for s in self.slices if s.axis == axis]

    def axis_pass_count(self, axis: str) -> int:
        """Number of slices within an axis that passed."""
        return sum(s.passed for s in self.slices_for_axis(axis))

    def summary(self) -> dict:
        axes: dict = {}
        for axis in self.axes_tested:
            slices = self.slices_for_axis(axis)
            axes[axis] = {
                "pass_count": self.axis_pass_count(axis),
                "total": len(slices),
                "slices": [
                    {
                        "label": s.label,
                        "n": s.n,
                        "mean_net_bps": round(s.mean_net_bps, 2),
                        "hit_rate": round(s.hit_rate, 3),
                        "passed": s.passed,
                    }
                    for s in slices
                ],
            }
        return {"horizon_hours": self.horizon_hours, "axes": axes}


def _slice_stats(returns: Sequence[float], axis: str, label: str) -> AxisSlice:
    arr = np.array(returns, dtype=float)
    n = len(arr)
    if n == 0:
        return AxisSlice(axis=axis, label=label, n=0,
                         mean_net_bps=0.0, hit_rate=0.0, profit_factor=0.0, passed=False)
    mn = float(np.mean(arr))
    hr = hit_rate(arr.tolist())
    pf = profit_factor(arr.tolist())
    return AxisSlice(axis=axis, label=label, n=n,
                     mean_net_bps=mn, hit_rate=hr, profit_factor=pf, passed=mn > 0)


def run_robustness_checks(
    net_returns: Sequence[float],
    *,
    horizon_hours: int = 4,
    volatility_proxy: Sequence[float] | None = None,
    cap_groups: Sequence[str] | None = None,
) -> RobustnessResult:
    """Run 4-axis robustness split on net return samples.

    Args:
        net_returns: Chronologically ordered net returns (bps) per entry.
        horizon_hours: Horizon these returns correspond to.
        volatility_proxy: Per-entry realized volatility proxy (e.g. ATR or
            rolling 30-bar std of returns).  When provided, entries are split
            at the median into high-vol / low-vol slices.
        cap_groups: Per-entry cap group label (one of mega/large/mid/small/
            micro/unknown).  When provided, each distinct group gets a slice.

    Returns:
        :class:`RobustnessResult` with AxisSlice per tested axis.
    """
    arr = np.array(net_returns, dtype=float)
    n = len(arr)
    slices: list[AxisSlice] = []

    # Axis 1 — Time split (first vs second half)
    if n >= 4:
        mid = n // 2
        slices.append(_slice_stats(arr[:mid].tolist(), "time", "first_half"))
        slices.append(_slice_stats(arr[mid:].tolist(), "time", "second_half"))

    # Axis 2 — Volatility split (requires volatility_proxy)
    if volatility_proxy is not None and len(volatility_proxy) == n and n >= 4:
        vol = np.array(volatility_proxy, dtype=float)
        median_vol = float(np.median(vol))
        high_mask = vol >= median_vol
        low_mask = ~high_mask
        slices.append(_slice_stats(arr[high_mask].tolist(), "volatility", "high_vol"))
        slices.append(_slice_stats(arr[low_mask].tolist(), "volatility", "low_vol"))

    # Axis 3 — Cap group split (requires cap_groups labels)
    if cap_groups is not None and len(cap_groups) == n:
        groups = np.array(cap_groups)
        for g in sorted(set(cap_groups)):
            mask = groups == g
            if mask.sum() >= 3:
                slices.append(_slice_stats(arr[mask].tolist(), "cap_group", str(g)))

    return RobustnessResult(horizon_hours=horizon_hours, slices=slices)
