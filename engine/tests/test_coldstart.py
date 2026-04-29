"""Tests for personalization.coldstart — 2 tests."""
from __future__ import annotations

import pytest

from personalization.coldstart import is_cold
from personalization.types import BetaState, UserPatternState


def _make_minimal_state(n_total: int) -> UserPatternState:
    return UserPatternState(
        user_id="u1",
        pattern_slug="test-pattern",
        states={},
        n_total=n_total,
    )


def test_cold_start_returns_global_under_10_total():
    """state.n_total=9 → is_cold(state)=True."""
    state = _make_minimal_state(9)
    assert is_cold(state) is True


def test_per_pattern_cold_start_under_3_verdicts():
    """state.n_total=2 → is_cold(state)=True."""
    state = _make_minimal_state(2)
    assert is_cold(state) is True
