from __future__ import annotations
from datetime import datetime, timezone
from .types import MinDaysInput, RuleEnum, RuleResult


def evaluate_min_days(inp: MinDaysInput) -> RuleResult:
    """
    MinTradingDays 체크.
    passed=True: 조건 충족 (PASSED 판정 가능)
    passed=False: 아직 미충족 (위반은 아님 — FAILED 전이 안 함)
    """
    evaluated_at = inp.evaluated_at or datetime.now(timezone.utc)
    satisfied = inp.trading_days >= inp.min_required

    return RuleResult(
        passed=satisfied,
        rule=RuleEnum.MIN_TRADING_DAYS,
        detail={
            "trading_days": inp.trading_days,
            "required": inp.min_required,
            "satisfied": satisfied,
            "evaluated_at": evaluated_at.isoformat(),
        },
    )
