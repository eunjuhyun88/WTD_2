"""W-0385: Tests for blocked_candidate_store insert_blocked_candidate.

Verifies new kwargs (source, pattern_slug, outcome_id) are passed through
to Supabase correctly, and that the function swallows exceptions gracefully.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch


def _make_sb_mock():
    sb = MagicMock()
    sb.table.return_value.insert.return_value.execute.return_value = None
    return sb


def test_insert_blocked_candidate_new_kwargs():
    """source / pattern_slug / outcome_id are included in the insert row."""
    from research.artifacts.blocked_candidate_store import insert_blocked_candidate

    sb_mock = _make_sb_mock()
    with patch("research.artifacts.blocked_candidate_store._sb", return_value=sb_mock):
        insert_blocked_candidate(
            symbol="BTCUSDT",
            timeframe="1h",
            direction="neutral",
            reason="below_min_conviction",
            score=0.42,
            p_win=0.38,
            source="ai_agent",
            pattern_slug="alpha-presurge-v1",
            outcome_id="abc-123",
        )

    call_args = sb_mock.table.return_value.insert.call_args
    row = call_args[0][0]
    assert row["source"] == "ai_agent"
    assert row["pattern_slug"] == "alpha-presurge-v1"
    assert row["outcome_id"] == "abc-123"
    assert row["symbol"] == "BTCUSDT"
    assert row["reason"] == "below_min_conviction"


def test_insert_blocked_candidate_default_source():
    """source defaults to 'engine' when not provided."""
    from research.artifacts.blocked_candidate_store import insert_blocked_candidate

    sb_mock = _make_sb_mock()
    with patch("research.artifacts.blocked_candidate_store._sb", return_value=sb_mock):
        insert_blocked_candidate(
            symbol="ETHUSDT",
            direction="neutral",
            reason="regime_mismatch",
        )

    row = sb_mock.table.return_value.insert.call_args[0][0]
    assert row["source"] == "engine"
    assert "pattern_slug" not in row
    assert "outcome_id" not in row


def test_insert_blocked_candidate_swallows_exception():
    """Supabase failure must not propagate — fire-and-forget contract."""
    from research.artifacts.blocked_candidate_store import insert_blocked_candidate

    sb_mock = MagicMock()
    sb_mock.table.return_value.insert.return_value.execute.side_effect = RuntimeError("network error")
    with patch("research.artifacts.blocked_candidate_store._sb", return_value=sb_mock):
        insert_blocked_candidate(
            symbol="SOLUSDT",
            direction="neutral",
            reason="anti_chase",
        )
    # no exception raised
