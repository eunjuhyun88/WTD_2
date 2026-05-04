from __future__ import annotations
from datetime import datetime, timezone
from .types import MllInput, RuleEnum, RuleResult


def evaluate_mll(inp: MllInput) -> RuleResult:
    """
    MLL 위반 판정.
    total_loss = realized_today - fee_today + unrealized
    위반: total_loss <= -(equity_start * mll_pct)
    수수료는 손실에 포함 (FTMO/MFF 기준, D-1 확정).
    """
    evaluated_at = inp.evaluated_at or datetime.now(timezone.utc)
    threshold = -(inp.equity_start * inp.mll_pct)
    total_loss = inp.realized_today - inp.fee_today + inp.unrealized
    total_loss_pct = total_loss / inp.equity_start if inp.equity_start else 0.0

    passed = total_loss > threshold   # 초과(덜 손실)면 통과

    return RuleResult(
        passed=passed,
        rule=RuleEnum.MLL,
        detail={
            "equity_start": inp.equity_start,
            "realized_today": inp.realized_today,
            "unrealized": inp.unrealized,
            "fee_today": inp.fee_today,
            "total_loss": total_loss,
            "total_loss_pct": round(total_loss_pct, 6),
            "threshold": threshold,
            "stale_mark": inp.stale_mark,
            "evaluated_at": evaluated_at.isoformat(),
        },
    )
