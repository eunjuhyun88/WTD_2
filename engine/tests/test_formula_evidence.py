"""W-0385: Unit tests for formula_evidence_materializer and blocked_candidate_resolver.

Tests materializer._compute() directly (no Supabase needed).
Tests resolver._forward_return_at_horizon() and _apply_direction().
"""
from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
import pytest


# ── formula_evidence_materializer._compute ───────────────────────────────────

def test_compute_basic():
    """_compute produces expected blocked_winner_rate and drag_score."""
    from scanner.jobs.formula_evidence_materializer import _compute, _THRESHOLD

    rows = [
        {"forward_24h": 0.01, "reason": "below_min_conviction"},   # winner (1%)
        {"forward_24h": 0.02, "reason": "below_min_conviction"},   # winner (2%)
        {"forward_24h": -0.01, "reason": "below_min_conviction"},  # loser
        {"forward_24h": 0.001, "reason": "below_min_conviction"},  # not winner (< threshold)
    ]
    result = _compute(rows, "below_min_conviction", "2026-01-01T00:00:00", "2026-02-01T00:00:00")

    assert result["scope_kind"] == "filter_rule"
    assert result["scope_value"] == "below_min_conviction"
    assert result["sample_n"] == 4
    # 2 winners out of 4 → 50%
    assert abs(result["blocked_winner_rate"] - 0.5) < 1e-6
    # 1 loser out of 4 → 25%
    assert abs(result["good_block_rate"] - 0.25) < 1e-6
    # drag_score > 0 since there are winners
    assert result["drag_score"] > 0
    assert "computed_at" in result


def test_compute_no_winners():
    """All losers → drag_score == 0, good_block_rate == 1.0."""
    from scanner.jobs.formula_evidence_materializer import _compute

    rows = [
        {"forward_24h": -0.01},
        {"forward_24h": -0.03},
        {"forward_24h": -0.005},
    ]
    result = _compute(rows, "regime_mismatch", "2026-01-01", "2026-02-01")
    assert result["blocked_winner_rate"] == 0.0
    assert abs(result["good_block_rate"] - 1.0) < 1e-6
    assert result["drag_score"] == 0.0


def test_compute_empty():
    """Empty rows → empty dict."""
    from scanner.jobs.formula_evidence_materializer import _compute
    result = _compute([], "anti_chase", "2026-01-01", "2026-02-01")
    assert result == {}


def test_compute_drag_score_unit():
    """drag_score = blocked_winner_rate × avg_missed × 10_000 (bps)."""
    from scanner.jobs.formula_evidence_materializer import _compute

    # 1 winner with 1% forward return → avg_missed=0.01, winner_rate=1.0
    rows = [{"forward_24h": 0.01}]
    result = _compute(rows, "heat_too_high", "2026-01-01", "2026-02-01")
    # drag_score = 1.0 * 0.01 * 10000 = 100 bps
    assert abs(result["drag_score"] - 100.0) < 0.01


# ── blocked_candidate_resolver._forward_return_at_horizon ───────────────────

def _make_klines(prices: list[float], start: datetime, freq: str = "1h") -> pd.DataFrame:
    """Build a minimal klines DataFrame."""
    idx = pd.date_range(start=start, periods=len(prices), freq=freq, tz="UTC")
    return pd.DataFrame({"close": prices}, index=idx)


def test_forward_return_basic():
    """Returns (future / entry) - 1 at correct horizon."""
    from scanner.jobs.blocked_candidate_resolver import _forward_return_at_horizon

    start = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    prices = [100.0, 101.0, 102.0, 110.0, 105.0]
    klines = _make_klines(prices, start)

    # ref_ts = start → entry_close = 100
    ret_1h = _forward_return_at_horizon(klines, start, horizon_h=1)
    assert ret_1h is not None
    # 1h later = 101/100 - 1 = 0.01
    assert abs(ret_1h - 0.01) < 1e-6

    ret_3h = _forward_return_at_horizon(klines, start, horizon_h=3)
    assert ret_3h is not None
    # 3h later = 110/100 - 1 = 0.10
    assert abs(ret_3h - 0.10) < 1e-6


def test_forward_return_insufficient_data():
    """Returns None when not enough future bars."""
    from scanner.jobs.blocked_candidate_resolver import _forward_return_at_horizon

    start = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    klines = _make_klines([100.0, 101.0], start)  # only 2 bars

    # Requesting 72h ahead — not enough data
    ret = _forward_return_at_horizon(klines, start, horizon_h=72)
    assert ret is None


def test_forward_return_empty_klines():
    """Returns None for empty DataFrame."""
    from scanner.jobs.blocked_candidate_resolver import _forward_return_at_horizon

    empty = pd.DataFrame(columns=["close"])
    ret = _forward_return_at_horizon(empty, datetime(2026, 1, 1, tzinfo=timezone.utc), horizon_h=1)
    assert ret is None


def test_apply_direction_short_flips_sign():
    """Short direction inverts return (profit on downward move)."""
    from scanner.jobs.blocked_candidate_resolver import _apply_direction

    assert _apply_direction(0.05, "short") == pytest.approx(-0.05)
    assert _apply_direction(-0.03, "short") == pytest.approx(0.03)


def test_apply_direction_long_unchanged():
    from scanner.jobs.blocked_candidate_resolver import _apply_direction

    assert _apply_direction(0.05, "long") == pytest.approx(0.05)
    assert _apply_direction(0.05, "neutral") == pytest.approx(0.05)
    assert _apply_direction(0.05, None) == pytest.approx(0.05)


def test_apply_direction_none_passthrough():
    from scanner.jobs.blocked_candidate_resolver import _apply_direction

    assert _apply_direction(None, "long") is None
    assert _apply_direction(None, "short") is None
