"""W-PF-202 룰 엔진 순수 함수 테스트 — MLL / MinDays / Consistency / ProfitGoal.

총 24 fixture. 외부 의존 없음.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from propfirm.rules.types import (
    MllInput, MinDaysInput, ConsistencyInput, ProfitGoalInput, RuleEnum,
)
from propfirm.rules.mll import evaluate_mll
from propfirm.rules.min_days import evaluate_min_days
from propfirm.rules.consistency import evaluate_consistency
from propfirm.rules.profit_goal import evaluate_profit_goal

_NOW = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)

# ─── MLL ─────────────────────────────────────────────────────────────────────

class TestMll:
    def _inp(self, **kw) -> MllInput:
        defaults = dict(
            equity_start=10_000.0,
            mll_pct=0.05,
            realized_today=0.0,
            fee_today=0.0,
            unrealized=0.0,
            stale_mark=False,
            evaluated_at=_NOW,
        )
        return MllInput(**{**defaults, **kw})

    def test_pass_zero_loss(self):
        r = evaluate_mll(self._inp())
        assert r.passed
        assert r.rule == RuleEnum.MLL

    def test_pass_small_loss(self):
        # -$400 < limit -$500 → pass
        r = evaluate_mll(self._inp(realized_today=-400.0))
        assert r.passed

    def test_pass_exact_limit(self):
        # -$500 == limit → pass (경계 포함)
        r = evaluate_mll(self._inp(realized_today=-500.0))
        assert r.passed

    def test_fail_over_limit(self):
        # -$501 > limit -$500 → fail
        r = evaluate_mll(self._inp(realized_today=-501.0))
        assert not r.passed

    def test_unrealized_included(self):
        # realized -300, unrealized -250 → total -550 > limit -500 → fail
        r = evaluate_mll(self._inp(realized_today=-300.0, unrealized=-250.0))
        assert not r.passed

    def test_stale_mark_ignores_unrealized(self):
        # unrealized -300이지만 stale_mark → 무시 → realized -300만 적용 → pass
        r = evaluate_mll(self._inp(realized_today=-300.0, unrealized=-300.0, stale_mark=True))
        assert r.passed

    def test_fee_included_in_loss(self):
        # realized -400, fee 200 → total -600 > limit -500 → fail
        r = evaluate_mll(self._inp(realized_today=-400.0, fee_today=200.0))
        assert not r.passed

    def test_detail_keys(self):
        r = evaluate_mll(self._inp(realized_today=-200.0))
        assert "daily_pnl" in r.detail
        assert "limit" in r.detail
        assert r.detail["limit"] == -500.0

# ─── MinDays ─────────────────────────────────────────────────────────────────

class TestMinDays:
    def _inp(self, **kw) -> MinDaysInput:
        defaults = dict(trading_days=0, min_required=10, evaluated_at=_NOW)
        return MinDaysInput(**{**defaults, **kw})

    def test_not_met(self):
        r = evaluate_min_days(self._inp(trading_days=5))
        assert not r.passed
        assert r.detail["remaining"] == 5

    def test_exact_met(self):
        r = evaluate_min_days(self._inp(trading_days=10))
        assert r.passed
        assert r.detail["remaining"] == 0

    def test_over_met(self):
        r = evaluate_min_days(self._inp(trading_days=15))
        assert r.passed

    def test_zero_days(self):
        r = evaluate_min_days(self._inp(trading_days=0))
        assert not r.passed
        assert r.detail["remaining"] == 10

# ─── Consistency ─────────────────────────────────────────────────────────────

class TestConsistency:
    def _inp(self, **kw) -> ConsistencyInput:
        defaults = dict(total_pnl=1000.0, max_single_day_pnl=300.0, cap_pct=0.40)
        return ConsistencyInput(**{**defaults, **kw})

    def test_pass_under_cap(self):
        # 300/1000 = 0.30 ≤ 0.40 → pass
        r = evaluate_consistency(self._inp())
        assert r.passed
        assert abs(r.detail["ratio"] - 0.30) < 1e-6

    def test_pass_exact_cap(self):
        # 400/1000 = 0.40 = cap → pass (경계 포함)
        r = evaluate_consistency(self._inp(max_single_day_pnl=400.0))
        assert r.passed

    def test_fail_over_cap(self):
        # 401/1000 = 0.401 > 0.40 → fail
        r = evaluate_consistency(self._inp(max_single_day_pnl=401.0))
        assert not r.passed

    def test_no_profit_skip(self):
        # total_pnl=0 → 미적용, pass
        r = evaluate_consistency(self._inp(total_pnl=0.0, max_single_day_pnl=0.0))
        assert r.passed
        assert r.detail["ratio"] == 0.0

    def test_negative_total_pnl_skip(self):
        r = evaluate_consistency(self._inp(total_pnl=-100.0, max_single_day_pnl=50.0))
        assert r.passed

    def test_custom_cap(self):
        # cap 0.30 → 300/1000 = 0.30 = 경계 → pass
        r = evaluate_consistency(self._inp(cap_pct=0.30))
        assert r.passed
        # cap 0.29 → fail
        r2 = evaluate_consistency(self._inp(cap_pct=0.29))
        assert not r2.passed

# ─── ProfitGoal ──────────────────────────────────────────────────────────────

class TestProfitGoal:
    def _inp(self, **kw) -> ProfitGoalInput:
        defaults = dict(equity_start=10_000.0, total_pnl=0.0, profit_goal_pct=0.08)
        return ProfitGoalInput(**{**defaults, **kw})

    def test_not_met(self):
        r = evaluate_profit_goal(self._inp(total_pnl=700.0))
        assert not r.passed
        assert r.detail["goal"] == 800.0
        assert r.detail["remaining"] == 100.0

    def test_exact_met(self):
        r = evaluate_profit_goal(self._inp(total_pnl=800.0))
        assert r.passed
        assert r.detail["remaining"] == 0.0

    def test_over_met(self):
        r = evaluate_profit_goal(self._inp(total_pnl=1200.0))
        assert r.passed

    def test_zero_pnl(self):
        r = evaluate_profit_goal(self._inp(total_pnl=0.0))
        assert not r.passed

    def test_negative_pnl(self):
        r = evaluate_profit_goal(self._inp(total_pnl=-100.0))
        assert not r.passed

    def test_detail_keys(self):
        r = evaluate_profit_goal(self._inp(total_pnl=500.0))
        assert "goal" in r.detail
        assert "remaining" in r.detail
        assert "profit_goal_pct" in r.detail
