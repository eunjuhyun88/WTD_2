"""
Consistency 룰 — W-PF-203
단일 거래일 PnL이 전체 누적 PnL의 40% 이상이면 위반.
"""
from __future__ import annotations
from datetime import datetime, timezone
from .types import ConsistencyInput, RuleEnum, RuleResult


def evaluate_consistency(inp: ConsistencyInput) -> RuleResult:
    """
    Consistency 위반 판정.
    total_pnl <= 0이면 평가 불가 → passed=True, detail에 skipped=True.
    max_single_day_pnl / total_pnl >= consistency_limit → 위반.
    경계값(정확히 40%)은 FAIL (>=).
    """
    evaluated_at = inp.evaluated_at or datetime.now(timezone.utc)

    if inp.total_pnl <= 0:
        return RuleResult(
            passed=True,
            rule=RuleEnum.CONSISTENCY,
            detail={
                "skipped": True,
                "total_pnl": inp.total_pnl,
                "max_single_day_pnl": inp.max_single_day_pnl,
                "consistency_limit": inp.consistency_limit,
                "evaluated_at": evaluated_at.isoformat(),
            },
        )

    ratio = inp.max_single_day_pnl / inp.total_pnl
    passed = ratio < inp.consistency_limit

    return RuleResult(
        passed=passed,
        rule=RuleEnum.CONSISTENCY,
        detail={
            "skipped": False,
            "total_pnl": inp.total_pnl,
            "max_single_day_pnl": inp.max_single_day_pnl,
            "consistency_limit": inp.consistency_limit,
            "ratio": round(ratio, 6),
            "evaluated_at": evaluated_at.isoformat(),
        },
    )
