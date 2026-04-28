from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class PaperTrade:
    outcome_id: str
    symbol: str | None
    outcome: str
    exit_return_pct: float
    duration_hours: float
    max_gain_pct: float


@dataclass(frozen=True)
class PaperVerificationResult:
    pattern_slug: str
    n_trades: int
    n_hit: int
    n_miss: int
    n_expired: int
    win_rate: float
    avg_return_pct: float
    sharpe: float
    max_drawdown_pct: float
    expectancy_pct: float
    avg_duration_hours: float
    pass_gate: bool
    gate_reasons: list[str] = field(default_factory=list)
