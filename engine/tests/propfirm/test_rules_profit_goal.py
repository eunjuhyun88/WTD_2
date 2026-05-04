"""
Profit Goal 룰 순수 함수 테스트 — 12 시나리오.
DB 의존 없음. 순수 계산 로직만 검증.
"""
import pytest
from datetime import datetime, timezone

from engine.propfirm.rules.profit_goal import evaluate_profit_goal
from engine.propfirm.rules.types import ProfitGoalInput, RuleEnum

FIXED_NOW = datetime(2026, 5, 4, 12, 0, 0, tzinfo=timezone.utc)

# (case_id, equity_start, total_pnl, profit_goal_pct, expected_passed)
PROFIT_GOAL_CASES = [
    # P01: 정확히 8% → 달성
    ("P01", 100_000.0, 8_000.0, 0.08, True),
    # P02: 8% 초과 → 달성
    ("P02", 100_000.0, 8_001.0, 0.08, True),
    # P03: 8% 미달 → 미달성
    ("P03", 100_000.0, 7_999.0, 0.08, False),
    # P04: 0% → 미달성
    ("P04", 100_000.0, 0.0, 0.08, False),
    # P05: 손실 중 → 미달성
    ("P05", 100_000.0, -1_000.0, 0.08, False),
    # P06: 10% → 달성
    ("P06", 100_000.0, 10_000.0, 0.08, True),
    # P07: 50k 계좌 8% 달성
    ("P07", 50_000.0, 4_000.0, 0.08, True),
    # P08: 50k 계좌 미달
    ("P08", 50_000.0, 3_999.0, 0.08, False),
    # P09: 10% 기준 미달
    ("P09", 100_000.0, 8_000.0, 0.10, False),
    # P10: 10% 기준 달성
    ("P10", 100_000.0, 10_000.0, 0.10, True),
    # P11: float 경계 미달
    ("P11", 100_000.0, 7_999.99, 0.08, False),
    # P12: float 경계 통과
    ("P12", 100_000.0, 8_000.01, 0.08, True),
]


@pytest.mark.parametrize(
    "case_id,equity_start,total_pnl,profit_goal_pct,expected",
    PROFIT_GOAL_CASES,
)
def test_profit_goal(
    case_id: str,
    equity_start: float,
    total_pnl: float,
    profit_goal_pct: float,
    expected: bool,
) -> None:
    result = evaluate_profit_goal(
        ProfitGoalInput(
            equity_start=equity_start,
            total_pnl=total_pnl,
            profit_goal_pct=profit_goal_pct,
            evaluated_at=FIXED_NOW,
        )
    )
    assert result.passed == expected, (
        f"[{case_id}] expected passed={expected}, got {result.passed}. detail={result.detail}"
    )
    assert result.rule == RuleEnum.PROFIT_GOAL
    # evaluated_at은 항상 ISO 문자열
    assert isinstance(result.detail["evaluated_at"], str)
    # target 필드 존재 확인
    assert "target" in result.detail
    assert result.detail["target"] == equity_start * profit_goal_pct
    # actual_pct 필드 존재 확인
    assert "actual_pct" in result.detail
