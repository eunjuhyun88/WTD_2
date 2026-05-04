"""
Profit Goal 룰 — W-PF-203
총 PnL이 equity_start의 8% 이상이면 목표 달성(passed=True).
미달은 FAILED 전이 안 함 — 단순 미충족 상태.
"""
from __future__ import annotations
from datetime import datetime, timezone
from .types import ProfitGoalInput, RuleEnum, RuleResult


def evaluate_profit_goal(inp: ProfitGoalInput) -> RuleResult:
    """
    Profit Goal 달성 판정.
    total_pnl >= equity_start * profit_goal_pct → passed=True.
    미달은 passed=False이나 FAILED 전이 없음 (단순 미충족).
    """
    evaluated_at = inp.evaluated_at or datetime.now(timezone.utc)

    target = inp.equity_start * inp.profit_goal_pct
    passed = inp.total_pnl >= target
    actual_pct = inp.total_pnl / inp.equity_start if inp.equity_start else 0.0

    return RuleResult(
        passed=passed,
        rule=RuleEnum.PROFIT_GOAL,
        detail={
            "equity_start": inp.equity_start,
            "total_pnl": inp.total_pnl,
            "profit_goal_pct": inp.profit_goal_pct,
            "target": target,
            "actual_pct": round(actual_pct, 6),
            "evaluated_at": evaluated_at.isoformat(),
        },
    )
