from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class RuleEnum(str, Enum):
    MLL = "mll"
    MAX_DRAWDOWN = "max_drawdown"
    CONSISTENCY = "consistency"
    PROFIT_GOAL = "profit_goal"
    MIN_TRADING_DAYS = "min_trading_days"


@dataclass
class RuleResult:
    passed: bool          # True = 룰 통과 (또는 해당 없음), False = 위반
    rule: RuleEnum
    detail: dict = field(default_factory=dict)
    # detail 스키마 (MLL): {equity_start, realized_today, unrealized, fee_today, total_loss_pct, stale_mark, evaluated_at}
    # detail 스키마 (MinDays): {trading_days, required, satisfied, evaluated_at}


@dataclass
class MllInput:
    equity_start: float           # 챌린지 시작 equity
    mll_pct: float                # 0.05 = 5%
    realized_today: float         # 오늘 realized PnL (음수 = 손실)
    fee_today: float              # 오늘 수수료 합계 (양수)
    unrealized: float             # 현재 unrealized PnL
    stale_mark: bool = False      # mark_px가 30s 이상 갱신 안 됐을 때 True
    evaluated_at: datetime | None = None


@dataclass
class MinDaysInput:
    trading_days: int             # evaluations.trading_days 캐시 값
    min_required: int             # challenge_tiers.min_trading_days (10)
    evaluated_at: datetime | None = None


@dataclass
class ConsistencyInput:
    total_pnl: float              # 챌린지 전체 누적 PnL
    max_single_day_pnl: float     # 단일 최대 거래일 PnL
    consistency_limit: float = 0.40  # 0.40 = 40%
    evaluated_at: datetime | None = None


@dataclass
class ProfitGoalInput:
    equity_start: float           # 챌린지 시작 equity
    total_pnl: float              # 챌린지 전체 누적 PnL
    profit_goal_pct: float = 0.08  # 0.08 = 8%
    evaluated_at: datetime | None = None
