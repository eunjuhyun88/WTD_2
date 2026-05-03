"""Tests for passport streak + badge logic (W-0401-P1).

Validates:
- AC1: streak 1/3/7/14/30 정확 (distinct UTC day)
- AC2: 같은 날 100 verdict = streak +1 (게이밍 방지)
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from engine.api.routes.passport import (
    _STREAK_LABELS,
    _STREAK_THRESHOLDS,
    _compute_badges,
    _compute_streak,
    _next_streak_threshold,
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _rows(days_ago: list[int]) -> list[dict]:
    """Build fake streak rows: each entry is N days ago from today UTC."""
    now = datetime.now(tz=timezone.utc)
    return [
        {"created_at": (now - timedelta(days=d)).strftime("%Y-%m-%dT%H:%M:%SZ")}
        for d in days_ago
    ]


def _rows_same_day(n: int) -> list[dict]:
    """Return n rows all from today UTC (gaming simulation)."""
    now = datetime.now(tz=timezone.utc)
    ts = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    return [{"created_at": ts}] * n


# ── _compute_streak ───────────────────────────────────────────────────────────

class TestComputeStreak:
    def test_empty_rows_returns_zero(self):
        assert _compute_streak([]) == 0

    def test_single_today_is_one(self):
        assert _compute_streak(_rows([0])) == 1

    def test_three_consecutive(self):
        assert _compute_streak(_rows([0, 1, 2])) == 3

    def test_seven_consecutive(self):
        assert _compute_streak(_rows(list(range(7)))) == 7

    def test_fourteen_consecutive(self):
        assert _compute_streak(_rows(list(range(14)))) == 14

    def test_thirty_consecutive(self):
        assert _compute_streak(_rows(list(range(30)))) == 30

    def test_gap_breaks_streak(self):
        # Days 0, 1 then gap at 2, then days 3, 4 — streak from today = 2
        assert _compute_streak(_rows([0, 1, 3, 4])) == 2

    def test_gap_starting_yesterday_breaks_streak(self):
        # Only yesterday, not today → streak = 0 (today missing)
        assert _compute_streak(_rows([1, 2, 3])) == 0

    def test_same_day_100_verdicts_counts_as_one(self):
        # AC2: 100 verdicts same day = streak of 1, not 100
        rows = _rows_same_day(100)
        assert _compute_streak(rows) == 1

    def test_same_day_spam_plus_yesterday(self):
        # 50 verdicts today + 50 verdicts yesterday = streak 2
        today_rows = _rows_same_day(50)
        yesterday = datetime.now(tz=timezone.utc) - timedelta(days=1)
        yesterday_rows = [{"created_at": yesterday.strftime("%Y-%m-%dT%H:%M:%SZ")}] * 50
        assert _compute_streak(today_rows + yesterday_rows) == 2

    def test_malformed_created_at_skipped(self):
        rows = [{"created_at": "bad-date"}, {"created_at": ""}]
        assert _compute_streak(rows) == 0

    def test_missing_created_at_skipped(self):
        rows = [{"other_field": "value"}]
        assert _compute_streak(rows) == 0


# ── _compute_badges ───────────────────────────────────────────────────────────

class TestComputeBadges:
    def test_no_badges_at_zero(self):
        badges = _compute_badges(0.0, 0, 0)
        assert badges == []

    def test_streak_1_badge(self):
        badges = _compute_badges(0.0, 0, 1)
        assert "1일 시작" in badges

    def test_streak_3_badge(self):
        badges = _compute_badges(0.0, 0, 3)
        assert "3일 연속" in badges
        assert "1일 시작" in badges

    def test_streak_7_badge(self):
        badges = _compute_badges(0.0, 0, 7)
        assert "7일 연속" in badges

    def test_streak_14_badge(self):
        badges = _compute_badges(0.0, 0, 14)
        assert "2주 연속" in badges

    def test_streak_30_badge(self):
        badges = _compute_badges(0.0, 0, 30)
        streak_badges = [b for b in badges if b in _STREAK_LABELS.values()]
        assert len(streak_badges) == 5  # all 5 streak badges earned

    def test_legacy_fifty_verdicts_badge(self):
        badges = _compute_badges(0.0, 50, 0)
        assert "첫 50 verdict" in badges

    def test_legacy_accuracy_badge(self):
        badges = _compute_badges(0.75, 0, 0)
        assert "정확도 70%+" in badges

    def test_streak_partial_does_not_grant_higher_tier(self):
        badges = _compute_badges(0.0, 0, 5)
        assert "7일 연속" not in badges
        assert "3일 연속" in badges


# ── _next_streak_threshold ────────────────────────────────────────────────────

class TestNextStreakThreshold:
    def test_zero_streak_next_is_one(self):
        assert _next_streak_threshold(0) == 1

    def test_one_next_is_three(self):
        assert _next_streak_threshold(1) == 3

    def test_three_next_is_seven(self):
        assert _next_streak_threshold(3) == 7

    def test_seven_next_is_fourteen(self):
        assert _next_streak_threshold(7) == 14

    def test_fourteen_next_is_thirty(self):
        assert _next_streak_threshold(14) == 30

    def test_thirty_plus_returns_none(self):
        assert _next_streak_threshold(30) is None
        assert _next_streak_threshold(100) is None

    def test_thresholds_list_has_five_entries(self):
        assert len(_STREAK_THRESHOLDS) == 5
