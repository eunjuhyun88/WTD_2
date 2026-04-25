"""Tests for copy_trading module — W-0132 Phase 1.

Covers:
- compute_judge_score formula (pure function, no DB)
- get_top_traders with a mocked Supabase client
- sync_trader_profile upsert path
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from copy_trading.leader_score import compute_judge_score, UserOutcomeSummary
from copy_trading.leaderboard import TraderProfile


# ── compute_judge_score ────────────────────────────────────────

class TestComputeJudgeScore:
    def test_all_wins(self):
        score = compute_judge_score(win_count=10, loss_count=0)
        # 10 * 10 + bonus(1.0 * 5) = 105
        assert score == pytest.approx(105.0, abs=0.1)

    def test_all_losses(self):
        score = compute_judge_score(win_count=0, loss_count=10)
        # max(0, -60 + 0) = 0
        assert score == 0.0

    def test_zero_trades(self):
        assert compute_judge_score(0, 0) == 0.0

    def test_mixed_positive(self):
        # 5W/3L → base=50-18=32, win_rate=5/8=0.625, bonus=3.125
        score = compute_judge_score(win_count=5, loss_count=3)
        assert score > 0

    def test_losses_penalise_more_than_wins_reward(self):
        # net-negative should clamp to 0
        score = compute_judge_score(win_count=1, loss_count=10)
        assert score == 0.0

    def test_score_non_negative(self):
        for w, l in [(0, 100), (3, 20), (1, 5)]:
            assert compute_judge_score(w, l) >= 0.0


# ── get_top_traders ────────────────────────────────────────────

class TestGetTopTraders:
    def _make_sb(self, rows):
        sb = MagicMock()
        (
            sb.table.return_value
            .select.return_value
            .order.return_value
            .limit.return_value
            .execute.return_value
            .data
        ) = rows
        return sb

    def test_empty_leaderboard(self):
        from copy_trading.leaderboard import get_top_traders
        sb = self._make_sb([])
        with patch("copy_trading.leaderboard._sb", return_value=sb):
            result = get_top_traders(limit=20)
        assert result == []

    def test_returns_trader_profiles(self):
        from copy_trading.leaderboard import get_top_traders
        rows = [
            {
                "user_id": "uid-1",
                "display_name": "Alice",
                "judge_score": "105.0",
                "win_count": "10",
                "loss_count": "0",
            },
            {
                "user_id": "uid-2",
                "display_name": "Bob",
                "judge_score": "32.6",
                "win_count": "5",
                "loss_count": "3",
            },
        ]
        sb = self._make_sb(rows)
        with patch("copy_trading.leaderboard._sb", return_value=sb):
            result = get_top_traders(limit=20)

        assert len(result) == 2
        assert result[0].user_id == "uid-1"
        assert result[0].display_name == "Alice"
        assert result[0].judge_score == pytest.approx(105.0)
        assert result[1].user_id == "uid-2"

    def test_respects_limit(self):
        from copy_trading.leaderboard import get_top_traders
        sb = self._make_sb([])
        with patch("copy_trading.leaderboard._sb", return_value=sb):
            get_top_traders(limit=5)
        # Confirm limit was passed to the query chain
        sb.table.return_value.select.return_value.order.return_value.limit.assert_called_with(5)


# ── sync_trader_profile ────────────────────────────────────────

class TestSyncTraderProfile:
    def _make_sb(self, outcome_rows):
        sb = MagicMock()
        # fetch_outcome_summary path
        (
            sb.table.return_value
            .select.return_value
            .eq.return_value
            .eq.return_value
            .execute.return_value
            .data
        ) = outcome_rows
        # upsert path
        sb.table.return_value.upsert.return_value.execute.return_value = MagicMock()
        return sb

    def test_upserts_on_sync(self):
        from copy_trading.leader_score import sync_trader_profile
        rows = [
            {"payload": {"outcome": "success"}},
            {"payload": {"outcome": "success"}},
            {"payload": {"outcome": "failure"}},
        ]
        sb = self._make_sb(rows)
        with patch("copy_trading.leader_score._sb", return_value=sb):
            summary = sync_trader_profile("uid-1", "Alice")

        assert summary.win_count == 2
        assert summary.loss_count == 1
        assert summary.judge_score > 0
        sb.table.return_value.upsert.assert_called_once()

    def test_pending_outcomes_ignored(self):
        from copy_trading.leader_score import sync_trader_profile
        rows = [
            {"payload": {"outcome": "pending"}},
            {"payload": {"outcome": "timeout"}},
            {"payload": {"outcome": "success"}},
        ]
        sb = self._make_sb(rows)
        with patch("copy_trading.leader_score._sb", return_value=sb):
            summary = sync_trader_profile("uid-1", "Alice")

        assert summary.win_count == 1
        assert summary.loss_count == 0
