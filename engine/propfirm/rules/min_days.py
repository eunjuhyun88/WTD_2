"""MinTradingDays 룰 — 최소 거래일수 충족 여부.

PASSED 전이 조건 중 하나. 위반이 아니라 진행 상태 체크.
"""
from __future__ import annotations

from .types import MinDaysInput, RuleEnum, RuleResult


def evaluate_min_days(inp: MinDaysInput) -> RuleResult:
    passed = inp.trading_days >= inp.min_required

    return RuleResult(
        rule=RuleEnum.MIN_TRADING_DAYS,
        passed=passed,
        detail={
            "trading_days": inp.trading_days,
            "min_required": inp.min_required,
            "remaining": max(0, inp.min_required - inp.trading_days),
            "evaluated_at": inp.evaluated_at.isoformat(),
        },
    )
