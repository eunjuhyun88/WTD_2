from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Sequence

import numpy as np

PERIODS_PER_YEAR: int = 365 * 24  # crypto 24/7


@dataclass
class RollingPerformance:
    n_samples: int
    mean_return_pct: float
    sharpe: float
    sortino: float
    calmar: float
    max_drawdown_pct: float
    cum_return_pct: float
    window_days: int
    horizon_hours: int
    last_updated_utc: str


def compute_sharpe(returns: np.ndarray, horizon_hours: int) -> float:
    if len(returns) < 2:
        return 0.0
    sd = returns.std(ddof=1)
    if sd < 1e-12:
        return 0.0
    return float(returns.mean() / sd * math.sqrt(PERIODS_PER_YEAR / horizon_hours))


def compute_sortino(returns: np.ndarray, horizon_hours: int) -> float:
    if len(returns) < 2:
        return 0.0
    downside = returns[returns < 0]
    if len(downside) == 0:
        return float("inf")
    dd = math.sqrt(float((downside ** 2).mean()))
    if dd < 1e-12:
        return 0.0
    return float(returns.mean() / dd * math.sqrt(PERIODS_PER_YEAR / horizon_hours))


def compute_calmar(
    returns: np.ndarray,
    horizon_hours: int,
) -> tuple[float, float]:
    if len(returns) < 2:
        return 0.0, 0.0
    eq = np.cumprod(1.0 + returns)
    running_max = np.maximum.accumulate(eq)
    dd_series = eq / running_max - 1.0
    max_dd = float(abs(dd_series.min()))
    n = len(returns)
    total_return = float(eq[-1] - 1.0)
    ann_return = (
        (1.0 + total_return) ** (PERIODS_PER_YEAR / max(n, 1) / horizon_hours) - 1.0
    )
    if max_dd < 1e-9:
        return float("inf"), max_dd
    return ann_return / max_dd, max_dd


def update_rolling_performance(
    verdict_returns: Sequence[float],
    horizon_hours: int,
    window_days: int = 30,
    persist_path: Optional[Path] = None,
) -> RollingPerformance:
    arr = np.asarray(verdict_returns, dtype=float)
    bars_per_window = window_days * 24 // max(horizon_hours, 1)
    if len(arr) > bars_per_window:
        arr = arr[-bars_per_window:]

    sharpe = compute_sharpe(arr, horizon_hours)
    sortino = compute_sortino(arr, horizon_hours)
    calmar, max_dd = compute_calmar(arr, horizon_hours)
    cum = float(np.prod(1.0 + arr) - 1.0) if len(arr) else 0.0

    perf = RollingPerformance(
        n_samples=len(arr),
        mean_return_pct=float(arr.mean() * 100) if len(arr) else 0.0,
        sharpe=round(sharpe, 4),
        sortino=round(sortino, 4) if math.isfinite(sortino) else 999.0,
        calmar=round(calmar, 4) if math.isfinite(calmar) else 999.0,
        max_drawdown_pct=round(max_dd * 100, 4),
        cum_return_pct=round(cum * 100, 4),
        window_days=window_days,
        horizon_hours=horizon_hours,
        last_updated_utc=datetime.now(timezone.utc).isoformat(),
    )

    if persist_path is not None:
        tmp = persist_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(asdict(perf), indent=2))
        tmp.replace(persist_path)
    return perf


def load_rolling_performance(
    persist_path: Path,
) -> Optional[RollingPerformance]:
    try:
        data = json.loads(Path(persist_path).read_text())
        return RollingPerformance(**data)
    except (FileNotFoundError, json.JSONDecodeError, TypeError):
        return None
