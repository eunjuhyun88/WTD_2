"""
MinTradingDays 순수 함수 테스트 — 24 시나리오 중 12개 (MinDays).
DB 의존 없음. 순수 계산 로직만 검증.
passed=False 는 "위반"이 아니라 "아직 미충족" (FAILED 전이 안 함).
"""
import pytest
from datetime import datetime, timezone

from engine.propfirm.rules.min_days import evaluate_min_days
from engine.propfirm.rules.types import MinDaysInput, RuleEnum

FIXED_NOW = datetime(2026, 5, 4, 12, 0, 0, tzinfo=timezone.utc)

# (case_id, trading_days, min_required, expected_passed)
MIN_DAYS_CASES = [
    # D01: 1일, 최소 10일 필요 → 미충족
    ("D01", 1,  10, False),
    # D02: 9일, 최소 10일 필요 → 미충족
    ("D02", 9,  10, False),
    # D03: 정확히 10일 → 충족
    ("D03", 10, 10, True),
    # D04: 11일 → 충족
    ("D04", 11, 10, True),
    # D05: 같은 날 다중 fill → trading_days 캐시=1 → 미충족
    ("D05", 1,  10, False),
    # D06: UTC 자정 경계 2일 → 미충족
    ("D06", 2,  10, False),
    # D07: 10일 (주말 포함 누적) → 충족
    ("D07", 10, 10, True),
    # D08: 10일 (비연속 날짜들) → 충족
    ("D08", 10, 10, True),
    # D09: 캐시 +1 후 10일 → 충족
    ("D09", 10, 10, True),
    # D10: 동일날 no-op 후에도 days=10 → 충족
    ("D10", 10, 10, True),
    # D11: PASSED 상태 이후 — status 체크는 hook, 순수함수는 True
    ("D11", 10, 10, True),
    # D12: UTC 통일 환경에서도 10일 → 충족
    ("D12", 10, 10, True),
]


@pytest.mark.parametrize(
    "case_id,trading_days,min_required,expected_passed",
    MIN_DAYS_CASES,
)
def test_min_days(
    case_id: str,
    trading_days: int,
    min_required: int,
    expected_passed: bool,
) -> None:
    result = evaluate_min_days(
        MinDaysInput(
            trading_days=trading_days,
            min_required=min_required,
            evaluated_at=FIXED_NOW,
        )
    )
    assert result.passed == expected_passed, (
        f"[{case_id}] expected passed={expected_passed}, got {result.passed}. detail={result.detail}"
    )
    assert result.rule == RuleEnum.MIN_TRADING_DAYS
    # detail 필드 존재 확인
    assert result.detail["trading_days"] == trading_days
    assert result.detail["required"] == min_required
    assert result.detail["satisfied"] == expected_passed
    assert isinstance(result.detail["evaluated_at"], str)
