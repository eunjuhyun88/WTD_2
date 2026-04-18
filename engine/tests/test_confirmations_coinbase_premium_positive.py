"""Tests for building_blocks.confirmations.coinbase_premium_positive."""
from __future__ import annotations

from building_blocks.confirmations.coinbase_premium_positive import coinbase_premium_positive


def test_fires_when_premium_positive_and_norm_elevated(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={
            "coinbase_premium": [0.001, 0.002, -0.001, 0.003],
            "coinbase_premium_norm": [0.3, 0.7, 0.8, 1.2],
        },
    )
    mask = coinbase_premium_positive(ctx)
    # bar0: norm=0.3 < 0.5 → False
    # bar1: premium>0 AND norm=0.7>=0.5 → True
    # bar2: premium<0 → False
    # bar3: premium>0 AND norm=1.2>=0.5 → True
    assert list(mask) == [False, True, False, True]


def test_zero_defaults_never_fire(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={
            "coinbase_premium": [0.0] * 4,
            "coinbase_premium_norm": [0.0] * 4,
        },
    )
    mask = coinbase_premium_positive(ctx)
    assert not mask.any()


def test_missing_columns_returns_all_false(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100],
        features={},
    )
    mask = coinbase_premium_positive(ctx)
    assert not mask.any()


def test_custom_thresholds(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100],
        features={
            "coinbase_premium": [0.001, 0.001, 0.001],
            "coinbase_premium_norm": [0.5, 1.0, 1.5],
        },
    )
    mask = coinbase_premium_positive(ctx, min_norm=1.0)
    assert list(mask) == [False, True, True]


def test_nan_fills_gracefully(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={
            "coinbase_premium": [float("nan"), 0.001],
            "coinbase_premium_norm": [0.8, 0.8],
        },
    )
    mask = coinbase_premium_positive(ctx)
    # nan fills to 0.0 → False (premium=0.0 not > 0); second bar True
    assert list(mask) == [False, True]
