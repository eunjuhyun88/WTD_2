"""MLL (Maximum Loss Limit) 룰 — 일일 손실 한도.

daily_pnl = realized_today - fee_today + unrealized (stale_mark=True면 unrealized=0)
위반 조건: daily_pnl < -(equity_start * mll_pct)
"""
from __future__ import annotations

from .types import MllInput, RuleEnum, RuleResult


def evaluate_mll(inp: MllInput) -> RuleResult:
    limit = inp.equity_start * inp.mll_pct
    unrealized = 0.0 if inp.stale_mark else inp.unrealized
    daily_pnl = inp.realized_today - inp.fee_today + unrealized

    passed = daily_pnl >= -limit

    return RuleResult(
        rule=RuleEnum.MLL,
        passed=passed,
        detail={
            "daily_pnl": round(daily_pnl, 6),
            "limit": round(-limit, 6),
            "equity_start": inp.equity_start,
            "mll_pct": inp.mll_pct,
            "realized_today": inp.realized_today,
            "fee_today": inp.fee_today,
            "unrealized": inp.unrealized,
            "stale_mark": inp.stale_mark,
            "evaluated_at": inp.evaluated_at.isoformat(),
        },
    )
