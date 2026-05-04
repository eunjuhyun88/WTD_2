"""ProfitGoal 룰 — 수익 목표 달성 여부.

PASSED 전이 조건 중 하나.
달성 조건: total_pnl >= equity_start * profit_goal_pct
"""
from __future__ import annotations

from .types import ProfitGoalInput, RuleEnum, RuleResult


def evaluate_profit_goal(inp: ProfitGoalInput) -> RuleResult:
    goal = inp.equity_start * inp.profit_goal_pct
    passed = inp.total_pnl >= goal

    return RuleResult(
        rule=RuleEnum.PROFIT_GOAL,
        passed=passed,
        detail={
            "total_pnl": round(inp.total_pnl, 6),
            "goal": round(goal, 6),
            "equity_start": inp.equity_start,
            "profit_goal_pct": inp.profit_goal_pct,
            "remaining": round(max(0.0, goal - inp.total_pnl), 6),
        },
    )
