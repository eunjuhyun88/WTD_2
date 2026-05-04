from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class RuleEnum(str, Enum):
    MLL = "mll"
    MAX_DRAWDOWN = "max_drawdown"
    CONSISTENCY = "consistency"
    PROFIT_GOAL = "profit_goal"
    MIN_TRADING_DAYS = "min_trading_days"


@dataclass
class RuleResult:
    rule: RuleEnum
    passed: bool
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass
class MllInput:
    equity_start: float      # 계정 시작 자본
    mll_pct: float           # 일일 손실 한도 비율 (e.g. 0.05)
    realized_today: float    # 오늘 실현 PnL (수수료 제외)
    fee_today: float         # 오늘 수수료 합계
    unrealized: float        # 현재 미실현 PnL (open positions)
    stale_mark: bool         # mark_px 30초 이상 미갱신 시 unrealized 무시
    evaluated_at: datetime


@dataclass
class MinDaysInput:
    trading_days: int
    min_required: int
    evaluated_at: datetime


@dataclass
class ConsistencyInput:
    total_pnl: float           # 챌린지 시작 이후 총 PnL
    max_single_day_pnl: float  # 단일 최고일 PnL
    cap_pct: float = 0.40      # 상한 비율 (challenge_tiers.consistency_cap_pct)


@dataclass
class ProfitGoalInput:
    equity_start: float
    total_pnl: float
    profit_goal_pct: float = 0.08  # challenge_tiers.profit_goal_pct
