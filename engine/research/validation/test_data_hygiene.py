"""Tests for W-0290 Phase 1 data hygiene module."""
from __future__ import annotations

import pandas as pd
import pytest

from engine.research.validation.data_hygiene import (
    HygieneCheckResult,
    check_data_hygiene,
)


def _utc_index(*timestamps: str) -> pd.DatetimeIndex:
    return pd.DatetimeIndex(timestamps, tz="UTC")


def test_clean_data_passes() -> None:
    """Clean data with no violations passes all checks."""
    # signal starts at T0, entries start after warmup_bars × bar_size_hours
    # warmup = 42 bars × 4h = 168h = 7 days
    signal = _utc_index("2024-01-01 00:00", "2024-01-02 00:00")
    entries = _utc_index("2024-01-10 00:00", "2024-01-11 00:00")
    result = check_data_hygiene(signal, entries, bar_size_hours=4, warmup_bars=42, strict=True)
    assert result.look_ahead_ok is True
    assert result.timezone_ok is True
    assert result.warmup_ok is True
    assert result.overall_pass is True
    assert result.violations == []


def test_look_ahead_detected() -> None:
    """Entry before first signal is flagged as look-ahead bias."""
    signal = _utc_index("2024-01-10 00:00", "2024-01-11 00:00")
    entries = _utc_index("2024-01-01 00:00", "2024-01-12 00:00")
    result = check_data_hygiene(signal, entries, strict=True)
    assert result.look_ahead_ok is False
    assert any("look_ahead" in v for v in result.violations)


def test_no_timezone_flagged() -> None:
    """Entry timestamps without timezone are flagged."""
    signal = _utc_index("2024-01-01 00:00", "2024-01-02 00:00")
    # No timezone
    entries = pd.DatetimeIndex(["2024-01-10 00:00", "2024-01-11 00:00"])
    result = check_data_hygiene(signal, entries, strict=True)
    assert result.timezone_ok is False
    assert any("timezone" in v for v in result.violations)


def test_warmup_violation() -> None:
    """Entry too close to signal start (before warmup) is flagged."""
    signal = _utc_index("2024-01-01 00:00", "2024-01-02 00:00")
    # warmup = 42 × 4 = 168h = 7 days; entry at +1 day is too early
    entries = _utc_index("2024-01-02 00:00", "2024-01-03 00:00")
    result = check_data_hygiene(signal, entries, bar_size_hours=4, warmup_bars=42, strict=True)
    assert result.warmup_ok is False
    assert any("warmup" in v for v in result.violations)


def test_strict_false_always_passes() -> None:
    """strict=False: overall_pass=True even with violations."""
    signal = _utc_index("2024-01-10 00:00")
    entries = _utc_index("2024-01-01 00:00")  # look-ahead violation
    result = check_data_hygiene(signal, entries, strict=False)
    assert result.look_ahead_ok is False
    assert result.overall_pass is True  # non-strict mode


def test_survivorship_always_false() -> None:
    """survivorship_flag is always False (corpus limitation)."""
    signal = _utc_index("2024-01-01 00:00")
    entries = _utc_index("2024-01-10 00:00")
    result = check_data_hygiene(signal, entries)
    assert result.survivorship_flag is False


def test_empty_timestamps_no_crash() -> None:
    """Empty indexes produce a clean result without errors."""
    empty = pd.DatetimeIndex([], tz="UTC")
    result = check_data_hygiene(empty, empty)
    assert result.look_ahead_ok is True
    assert result.violations == []
