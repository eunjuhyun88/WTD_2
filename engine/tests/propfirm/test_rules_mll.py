"""
MLL (Maximum Loss Limit) 순수 함수 테스트 — 24 시나리오 중 12개 (MLL).
DB 의존 없음. 순수 계산 로직만 검증.
"""
import pytest
from datetime import datetime, timezone

from engine.propfirm.rules.mll import evaluate_mll
from engine.propfirm.rules.types import MllInput, RuleEnum

FIXED_NOW = datetime(2026, 5, 4, 12, 0, 0, tzinfo=timezone.utc)

# (case_id, equity_start, realized_today, fee_today, unrealized, stale_mark, expected_passed)
MLL_CASES = [
    # M01: 아무 손실 없음 → 통과
    ("M01", 100_000, 0,      0,   0,      False, True),
    # M02: 손실 -4990 (threshold -5000 미달) → 통과
    ("M02", 100_000, -4_990, 0,   0,      False, True),
    # M03: 손실 정확히 -5000 (threshold와 같음, strict >) → 위반
    ("M03", 100_000, -5_000, 0,   0,      False, False),
    # M04: 손실 -5010 → 위반
    ("M04", 100_000, -5_010, 0,   0,      False, False),
    # M05: realized -3000 + unrealized -2500 = -5500 → 위반
    ("M05", 100_000, -3_000, 0,   -2_500, False, False),
    # M06: 어제 손실은 input에 포함 안 됨 — 오늘 값만 계산 → 통과
    ("M06", 100_000, 0,      0,   0,      False, True),
    # M07: 오늘 realized -4000만 → -4% → 통과
    ("M07", 100_000, -4_000, 0,   0,      False, True),
    # M08: realized -4900 + fee 200 → total = -4900 - 200 = -5100 → 위반
    ("M08", 100_000, -4_900, 200, 0,      False, False),
    # M09: realized -6000 + unrealized +2000 = -4000 → 통과
    ("M09", 100_000, -6_000, 0,   2_000,  False, True),
    # M10: realized -2000 + unrealized -3500 = -5500 → 위반
    ("M10", 100_000, -2_000, 0,   -3_500, False, False),
    # M11: stale_mark=True + total -6000 → 위반 + detail["stale_mark"]==True
    ("M11", 100_000, -4_000, 0,   -2_000, True,  False),
    # M12: realized -10000 → 수치 기준 위반 (evaluation status 체크는 hook 레벨)
    ("M12", 100_000, -10_000, 0,  0,      False, False),
]


@pytest.mark.parametrize(
    "case_id,equity_start,realized_today,fee_today,unrealized,stale_mark,expected",
    MLL_CASES,
)
def test_mll(
    case_id: str,
    equity_start: float,
    realized_today: float,
    fee_today: float,
    unrealized: float,
    stale_mark: bool,
    expected: bool,
) -> None:
    result = evaluate_mll(
        MllInput(
            equity_start=equity_start,
            mll_pct=0.05,
            realized_today=realized_today,
            fee_today=fee_today,
            unrealized=unrealized,
            stale_mark=stale_mark,
            evaluated_at=FIXED_NOW,
        )
    )
    assert result.passed == expected, (
        f"[{case_id}] expected passed={expected}, got {result.passed}. detail={result.detail}"
    )
    assert result.rule == RuleEnum.MLL
    # stale_mark가 True일 때 detail에 반드시 반영
    if stale_mark:
        assert result.detail["stale_mark"] is True, (
            f"[{case_id}] stale_mark should be True in detail"
        )
    # evaluated_at은 항상 ISO 문자열
    assert isinstance(result.detail["evaluated_at"], str)
    # threshold 필드 존재 확인
    assert "threshold" in result.detail
    assert result.detail["threshold"] == -(equity_start * 0.05)
