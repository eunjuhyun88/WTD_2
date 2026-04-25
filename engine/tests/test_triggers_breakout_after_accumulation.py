from __future__ import annotations

import pytest

from building_blocks.triggers import breakout_after_accumulation


def test_fires_after_dump_hold_accumulation_and_local_breakout(make_ctx) -> None:
    closes = [
        100.0, 100.0, 100.0, 100.0, 100.0, 100.0,
        100.0, 100.0, 100.0, 100.0, 100.0, 100.0,
        78.0,
        80.0, 82.0, 84.0, 86.0, 88.0, 90.0, 91.0, 91.5, 92.0, 92.0, 92.2,
        96.0,
    ]
    n = len(closes)
    highs = [c + 1.0 for c in closes]
    lows = [c - 1.0 for c in closes]
    features = {
        "price_change_1h": [0.0] * 12 + [-0.12] + [0.02] * (n - 13),
        "oi_change_1h": [0.0] * 12 + [0.10] + [0.01] * (n - 13),
        "oi_change_24h": [0.0] * 12 + [0.12] + [0.15] * (n - 13),
        "vol_zscore": [0.0] * 12 + [2.0] + [0.4] * (n - 13),
        "funding_rate": [-0.01] * 16 + [0.01] * (n - 16),
    }
    ctx = make_ctx(close=closes, overrides={"high": highs, "low": lows}, features=features)

    mask = breakout_after_accumulation(
        ctx,
        dump_lookback_bars=20,
        accumulation_lookback_bars=10,
        range_bars=6,
        max_range_pct=0.12,
    )

    assert bool(mask.iloc[-1]) is True


def test_does_not_fire_on_breakout_without_recent_dump_hold_structure(make_ctx) -> None:
    closes = [100.0 + 0.8 * i for i in range(25)]
    n = len(closes)
    features = {
        "price_change_1h": [0.01] * n,
        "oi_change_1h": [0.01] * n,
        "oi_change_24h": [0.01] * n,
        "vol_zscore": [0.2] * n,
        "funding_rate": [0.01] * n,
    }
    ctx = make_ctx(close=closes, features=features)

    mask = breakout_after_accumulation(
        ctx,
        dump_lookback_bars=20,
        accumulation_lookback_bars=10,
        range_bars=6,
    )

    assert not mask.any()


def test_requires_positive_windows(make_ctx) -> None:
    ctx = make_ctx(close=[100.0] * 20)
    with pytest.raises(ValueError):
        breakout_after_accumulation(ctx, dump_lookback_bars=1)
    with pytest.raises(ValueError):
        breakout_after_accumulation(ctx, accumulation_lookback_bars=1)
    with pytest.raises(ValueError):
        breakout_after_accumulation(ctx, range_bars=1)
