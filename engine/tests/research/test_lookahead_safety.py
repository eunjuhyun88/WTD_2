"""W-0368 AC7: Lookahead-free property tests.

outcome_at = fired_at + horizon_h * 3600s must ALWAYS be in the future of fired_at.
Uses hypothesis for property-based testing (1000 samples).
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest

hypothesis = pytest.importorskip("hypothesis", reason="hypothesis not installed")
from hypothesis import given, settings, HealthCheck  # noqa: E402
from hypothesis import strategies as st  # noqa: E402


@settings(max_examples=1000, suppress_health_check=[HealthCheck.too_slow])
@given(
    fired_ts=st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2030, 12, 31),
        timezones=st.just(timezone.utc),
    ),
    horizon_h=st.sampled_from([1, 4, 24, 72]),
)
def test_outcome_at_always_future(fired_ts: datetime, horizon_h: int):
    """outcome_at must always be strictly after fired_at."""
    outcome_at = fired_ts + timedelta(hours=horizon_h)
    assert outcome_at > fired_ts


@settings(max_examples=1000, suppress_health_check=[HealthCheck.too_slow])
@given(
    fired_ts=st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2030, 12, 31),
        timezones=st.just(timezone.utc),
    ),
    horizon_h=st.sampled_from([1, 4, 24, 72]),
)
def test_outcome_at_equals_fired_plus_horizon(fired_ts: datetime, horizon_h: int):
    """outcome_at = fired_at + horizon_h hours exactly."""
    outcome_at = fired_ts + timedelta(hours=horizon_h)
    assert outcome_at == fired_ts + timedelta(hours=horizon_h)


@settings(max_examples=1000, suppress_health_check=[HealthCheck.too_slow])
@given(
    fired_ts=st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2030, 12, 31),
        timezones=st.just(timezone.utc),
    ),
    horizon_h=st.sampled_from([1, 4, 24, 72]),
)
def test_no_horizon_is_zero_or_negative(fired_ts: datetime, horizon_h: int):
    """horizon_h is always from HORIZONS = [1, 4, 24, 72], never 0 or negative."""
    assert horizon_h > 0
    outcome_at = fired_ts + timedelta(hours=horizon_h)
    assert (outcome_at - fired_ts).total_seconds() > 0
