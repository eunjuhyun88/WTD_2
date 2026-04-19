"""Tests for building_blocks.confirmations.relative_velocity_bull.

relative_velocity_bull delegates to alt_btc_accel_ratio, so these tests
verify the wrapping contract (correct delegation, min_ratio forwarding,
validation) without re-testing the full BTC-load path.
"""
from __future__ import annotations

import unittest.mock as mock

import pandas as pd
import pytest

from building_blocks.confirmations.relative_velocity_bull import relative_velocity_bull


def _make_bool_series(values: list[bool]) -> pd.Series:
    idx = pd.date_range("2025-01-01", periods=len(values), freq="1h", tz="UTC")
    return pd.Series(values, index=idx, dtype=bool)


def test_delegates_to_alt_btc_accel_ratio(make_ctx):
    """relative_velocity_bull forwards min_ratio to alt_btc_accel_ratio."""
    ctx = make_ctx(close=[100.0] * 10)
    expected = _make_bool_series([False] * 10)

    with mock.patch(
        "building_blocks.confirmations.relative_velocity_bull.alt_btc_accel_ratio",
        return_value=expected,
    ) as mock_fn:
        result = relative_velocity_bull(ctx, min_ratio=1.5, window=3)

    mock_fn.assert_called_once_with(ctx, ratio_threshold=1.5, window=3)
    pd.testing.assert_series_equal(result, expected)


def test_default_min_ratio_is_1_2(make_ctx):
    """Default min_ratio=1.2 matches Signal Radar GOLDEN filter D."""
    ctx = make_ctx(close=[100.0] * 10)
    expected = _make_bool_series([True] * 10)

    with mock.patch(
        "building_blocks.confirmations.relative_velocity_bull.alt_btc_accel_ratio",
        return_value=expected,
    ) as mock_fn:
        relative_velocity_bull(ctx)

    call_kwargs = mock_fn.call_args[1]
    assert call_kwargs["ratio_threshold"] == 1.2


def test_invalid_min_ratio_raises():
    """min_ratio <= 0 raises ValueError before delegating."""
    import pandas as pd
    from building_blocks.context import Context

    idx = pd.date_range("2025-01-01", periods=5, freq="1h", tz="UTC")
    klines = pd.DataFrame(
        {"open": [1.0] * 5, "high": [1.01] * 5, "low": [0.99] * 5,
         "close": [1.0] * 5, "volume": [1000.0] * 5, "taker_buy_base_volume": [500.0] * 5},
        index=idx,
    )
    feat = pd.DataFrame({"_dummy": [0.0] * 5}, index=idx)
    ctx = Context(klines=klines, features=feat, symbol="TEST")

    with pytest.raises(ValueError, match="min_ratio"):
        relative_velocity_bull(ctx, min_ratio=0.0)

    with pytest.raises(ValueError, match="min_ratio"):
        relative_velocity_bull(ctx, min_ratio=-1.0)
