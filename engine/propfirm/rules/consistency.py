"""Consistency 룰 — 단일 최고일 PnL 비중 상한.

위반 조건: max_single_day_pnl / total_pnl > cap_pct (total_pnl > 0인 경우만)
total_pnl <= 0이면 미적용 (passed=True).
"""
from __future__ import annotations

from .types import ConsistencyInput, RuleEnum, RuleResult


def evaluate_consistency(inp: ConsistencyInput) -> RuleResult:
    if inp.total_pnl <= 0:
        ratio = 0.0
        passed = True
    else:
        ratio = inp.max_single_day_pnl / inp.total_pnl
        passed = ratio <= inp.cap_pct

    return RuleResult(
        rule=RuleEnum.CONSISTENCY,
        passed=passed,
        detail={
            "total_pnl": round(inp.total_pnl, 6),
            "max_single_day_pnl": round(inp.max_single_day_pnl, 6),
            "ratio": round(ratio, 6),
            "cap_pct": inp.cap_pct,
        },
    )
