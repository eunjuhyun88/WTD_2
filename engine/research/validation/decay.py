"""W-0290 Phase 2 — Pattern decay monitor.

Rolling window performance check: if a pattern's net edge has gone negative
over the last 30 / 60 / 90 days, flag it as decaying.  Deprecated trigger
fires when both 30d and 60d windows are simultaneously negative.

Design follows W-0290 §8.5 (Deprecated trigger):
  - rolling 30d AND 60d mean net bps both negative → deprecated
  - or B0 not beaten for 3 consecutive windows → deprecated
  - execution cost exceeds expected edge → deprecated
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Sequence, Literal

import numpy as np


DecayStatus = Literal["healthy", "warning", "deprecated"]


@dataclass
class WindowMetrics:
    """Net edge stats for one rolling window."""

    window_days: int
    n: int
    mean_net_bps: float
    hit_rate: float
    is_negative: bool   # mean_net_bps <= 0


@dataclass
class DecayResult:
    """Decay check result for a pattern × horizon."""

    horizon_hours: int
    status: DecayStatus
    reason: str
    windows: list[WindowMetrics]
    checked_at: str = ""   # ISO 8601

    def __post_init__(self) -> None:
        if not self.checked_at:
            self.checked_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> dict:
        return {
            "horizon_hours": self.horizon_hours,
            "status": self.status,
            "reason": self.reason,
            "checked_at": self.checked_at,
            "windows": [
                {
                    "window_days": w.window_days,
                    "n": w.n,
                    "mean_net_bps": round(w.mean_net_bps, 2),
                    "hit_rate": round(w.hit_rate, 3),
                    "is_negative": w.is_negative,
                }
                for w in self.windows
            ],
        }


def _window_metrics(
    net_returns: Sequence[float],
    entry_timestamps: Sequence[datetime],
    window_days: int,
    reference_dt: datetime,
) -> WindowMetrics:
    """Compute rolling-window metrics for the last ``window_days`` days."""
    cutoff = reference_dt.timestamp() - window_days * 86400
    indices = [
        i for i, ts in enumerate(entry_timestamps)
        if ts.timestamp() >= cutoff
    ]
    if not indices:
        return WindowMetrics(window_days=window_days, n=0,
                             mean_net_bps=0.0, hit_rate=0.0, is_negative=True)
    arr = np.array([net_returns[i] for i in indices], dtype=float)
    mn = float(np.mean(arr))
    hr = float(np.mean(arr > 0))
    return WindowMetrics(
        window_days=window_days,
        n=len(arr),
        mean_net_bps=mn,
        hit_rate=hr,
        is_negative=mn <= 0,
    )


def check_decay(
    net_returns: Sequence[float],
    entry_timestamps: Sequence[datetime],
    *,
    horizon_hours: int = 4,
    reference_dt: datetime | None = None,
    cost_bps: float = 15.0,
    window_days: tuple[int, ...] = (30, 60, 90),
    min_window_n: int = 5,
) -> DecayResult:
    """Run rolling-window decay checks on a pattern's net return history.

    Args:
        net_returns: Chronologically ordered per-entry net returns (bps).
        entry_timestamps: UTC datetime of each entry event (same order as
            ``net_returns``).
        horizon_hours: Horizon these returns were labeled at.
        reference_dt: Reference "now" for window cutting (defaults to UTC now).
        cost_bps: Estimated round-trip cost.  If ``mean_net_bps < cost_bps``
            in the 30d window, a warning is raised.
        window_days: Rolling window sizes to evaluate.
        min_window_n: Minimum entries required to score a window; windows
            below this threshold are treated as insufficient-data (non-fatal).

    Returns:
        :class:`DecayResult` with status ``healthy``, ``warning``, or
        ``deprecated``.
    """
    ref_dt = reference_dt or datetime.now(timezone.utc)
    n_total = len(net_returns)

    if n_total == 0 or len(entry_timestamps) != n_total:
        return DecayResult(
            horizon_hours=horizon_hours,
            status="healthy",
            reason="insufficient data",
            windows=[],
        )

    windows: list[WindowMetrics] = [
        _window_metrics(net_returns, entry_timestamps, d, ref_dt)
        for d in window_days
    ]

    # — Deprecated: 30d AND 60d both negative with sufficient samples
    w30 = next((w for w in windows if w.window_days == 30), None)
    w60 = next((w for w in windows if w.window_days == 60), None)
    if (
        w30 is not None and w60 is not None
        and w30.n >= min_window_n and w60.n >= min_window_n
        and w30.is_negative and w60.is_negative
    ):
        return DecayResult(
            horizon_hours=horizon_hours,
            status="deprecated",
            reason=f"30d mean={w30.mean_net_bps:.1f}bps AND 60d mean={w60.mean_net_bps:.1f}bps both negative",
            windows=windows,
        )

    # — Warning: cost exceeds 30d edge
    if w30 is not None and w30.n >= min_window_n and 0 < w30.mean_net_bps < cost_bps:
        return DecayResult(
            horizon_hours=horizon_hours,
            status="warning",
            reason=f"30d edge ({w30.mean_net_bps:.1f}bps) < cost ({cost_bps:.1f}bps)",
            windows=windows,
        )

    # — Warning: any single window negative with sufficient data
    for w in windows:
        if w.n >= min_window_n and w.is_negative:
            return DecayResult(
                horizon_hours=horizon_hours,
                status="warning",
                reason=f"{w.window_days}d window negative (mean={w.mean_net_bps:.1f}bps, n={w.n})",
                windows=windows,
            )

    return DecayResult(
        horizon_hours=horizon_hours,
        status="healthy",
        reason="all windows positive",
        windows=windows,
    )
