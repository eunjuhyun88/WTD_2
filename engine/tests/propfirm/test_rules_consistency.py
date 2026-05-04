"""
Consistency 룰 순수 함수 테스트 — 12 시나리오.
DB 의존 없음. 순수 계산 로직만 검증.
"""
import pytest
from datetime import datetime, timezone

from engine.propfirm.rules.consistency import evaluate_consistency
from engine.propfirm.rules.types import ConsistencyInput, RuleEnum

FIXED_NOW = datetime(2026, 5, 4, 12, 0, 0, tzinfo=timezone.utc)

# (case_id, total_pnl, max_single_day_pnl, expected_passed)
CONSISTENCY_CASES = [
    # C01: 30% < 40% → 통과
    ("C01", 1000.0, 300.0, True),
    # C02: 39.9% < 40% → 통과
    ("C02", 1000.0, 399.0, True),
    # C03: 정확히 40% → FAIL (>=)
    ("C03", 1000.0, 400.0, False),
    # C04: 40.1% → FAIL
    ("C04", 1000.0, 401.0, False),
    # C05: 100% → FAIL
    ("C05", 1000.0, 1000.0, False),
    # C06: total_pnl=0 → skip → passed=True
    ("C06", 0.0, 0.0, True),
    # C07: total_pnl<0 → skip → passed=True
    ("C07", -100.0, 50.0, True),
    # C08: 200/500 = 40% → FAIL
    ("C08", 500.0, 200.0, False),
    # C09: 700/2000 = 35% < 40% → 통과
    ("C09", 2000.0, 700.0, True),
    # C10: 39/100 = 39% < 40% → 통과
    ("C10", 100.0, 39.0, True),
    # C11: 40/100 = 40% → FAIL
    ("C11", 100.0, 40.0, False),
    # C12: 0.0039/0.01 = 39% 미만 → 통과 (float precision near boundary)
    ("C12", 0.01, 0.0039, True),
]


@pytest.mark.parametrize(
    "case_id,total_pnl,max_single_day_pnl,expected",
    CONSISTENCY_CASES,
)
def test_consistency(
    case_id: str,
    total_pnl: float,
    max_single_day_pnl: float,
    expected: bool,
) -> None:
    result = evaluate_consistency(
        ConsistencyInput(
            total_pnl=total_pnl,
            max_single_day_pnl=max_single_day_pnl,
            consistency_limit=0.40,
            evaluated_at=FIXED_NOW,
        )
    )
    assert result.passed == expected, (
        f"[{case_id}] expected passed={expected}, got {result.passed}. detail={result.detail}"
    )
    assert result.rule == RuleEnum.CONSISTENCY
    # evaluated_at은 항상 ISO 문자열
    assert isinstance(result.detail["evaluated_at"], str)
    # skip 케이스 확인
    if total_pnl <= 0:
        assert result.detail["skipped"] is True, (
            f"[{case_id}] total_pnl<=0 should have skipped=True in detail"
        )
    else:
        assert result.detail["skipped"] is False
        assert "ratio" in result.detail
