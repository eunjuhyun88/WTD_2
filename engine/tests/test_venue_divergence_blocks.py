"""Tests for W-0122 Pillar 3 Venue Divergence blocks.

venue_oi_divergence, venue_funding_spread_extreme, isolated_venue_pump.
"""
from __future__ import annotations

from building_blocks.confirmations.venue_oi_divergence import venue_oi_divergence
from building_blocks.confirmations.venue_funding_spread_extreme import (
    venue_funding_spread_extreme,
)
from building_blocks.confirmations.isolated_venue_pump import isolated_venue_pump


# ── venue_oi_divergence ─────────────────────────────────────────────────────

def test_venue_oi_bear_div_bybit_isolated(make_ctx):
    """Bybit running hot while Binance flat → bear_divergence fires."""
    ctx = make_ctx(
        close=[100] * 3,
        features={
            "binance_oi_change_1h": [0.0,  0.001, 0.005],
            "bybit_oi_change_1h":   [0.02, 0.06,  0.08],
            "okx_oi_change_1h":     [0.01, 0.02,  0.03],
        },
    )
    mask = venue_oi_divergence(ctx, mode="bear_divergence", leader_threshold=0.05, follower_threshold=0.01)
    # bar0: bybit=0.02 < 0.05 → False
    # bar1: bybit=0.06 >= 0.05, binance=0.001 < 0.01 → True
    # bar2: bybit=0.08 >= 0.05, binance=0.005 < 0.01 → True
    assert list(mask) == [False, True, True]


def test_venue_oi_bull_div_binance_leading(make_ctx):
    """Binance leading, bybit/okx following at less than 60% → bull_divergence fires."""
    ctx = make_ctx(
        close=[100] * 2,
        features={
            "binance_oi_change_1h": [0.08, 0.10],
            "bybit_oi_change_1h":   [0.03, 0.04],  # < 0.6×binance
            "okx_oi_change_1h":     [0.02, 0.03],
        },
    )
    mask = venue_oi_divergence(ctx, mode="bull_divergence", leader_threshold=0.05)
    assert list(mask) == [True, True]


def test_venue_oi_missing_columns_returns_false(make_ctx):
    """Graceful fallback when per-venue features are absent."""
    ctx = make_ctx(close=[100] * 3, features={})
    mask = venue_oi_divergence(ctx, mode="bear_divergence")
    assert not mask.any()


def test_venue_oi_no_divergence_when_all_flat(make_ctx):
    ctx = make_ctx(
        close=[100] * 2,
        features={
            "binance_oi_change_1h": [0.001, 0.002],
            "bybit_oi_change_1h":   [0.002, 0.001],
            "okx_oi_change_1h":     [0.001, 0.002],
        },
    )
    mask = venue_oi_divergence(ctx, mode="bear_divergence", leader_threshold=0.05)
    assert list(mask) == [False, False]


# ── venue_funding_spread_extreme ────────────────────────────────────────────

def test_funding_spread_extreme_fires_on_wide_spread(make_ctx):
    """When (max - min) funding across venues > threshold, block fires."""
    ctx = make_ctx(
        close=[100] * 3,
        features={
            "binance_funding": [0.0001,  0.0002,  -0.0002],
            "bybit_funding":   [0.00015, -0.0001, 0.00015],
            "okx_funding":     [0.0002,  0.0004,  -0.0004],
        },
    )
    mask = venue_funding_spread_extreme(ctx, spread_threshold=0.0003)
    # bar0: spread = 0.0002 - 0.0001 = 0.0001 < 0.0003 → False
    # bar1: spread = 0.0004 - (-0.0001) = 0.0005 ≥ 0.0003 → True
    # bar2: spread = 0.00015 - (-0.0004) = 0.00055 ≥ 0.0003 → True
    assert list(mask) == [False, True, True]


def test_funding_spread_missing_columns(make_ctx):
    ctx = make_ctx(close=[100] * 2, features={})
    mask = venue_funding_spread_extreme(ctx)
    assert not mask.any()


# ── isolated_venue_pump ─────────────────────────────────────────────────────

def test_isolated_pump_one_venue_moves_others_flat(make_ctx):
    """Exactly one venue exceeds leader threshold; other two are flat."""
    ctx = make_ctx(
        close=[100] * 3,
        features={
            "binance_price_change_1h": [0.001, 0.0005, 0.015],
            "bybit_price_change_1h":   [0.02,  0.001,  0.001],
            "okx_price_change_1h":     [0.001, 0.0001, 0.001],
        },
    )
    mask = isolated_venue_pump(ctx, leader_threshold=0.008, follower_max=0.002)
    # bar0: bybit=0.02>=0.008 alone; binance=0.001, okx=0.001 flat → True
    # bar1: no venue exceeds 0.008 → False
    # bar2: binance=0.015 alone; bybit=0.001, okx=0.001 flat → True
    assert list(mask) == [True, False, True]


def test_isolated_pump_requires_others_flat(make_ctx):
    """Two venues moving simultaneously → not isolated."""
    ctx = make_ctx(
        close=[100] * 2,
        features={
            "binance_price_change_1h": [0.015, 0.015],
            "bybit_price_change_1h":   [0.012, 0.001],
            "okx_price_change_1h":     [0.001, 0.001],
        },
    )
    mask = isolated_venue_pump(ctx, leader_threshold=0.008, follower_max=0.002)
    # bar0: 2 exceed → False
    # bar1: 1 exceed (binance), 2 flat → True
    assert list(mask) == [False, True]


def test_isolated_pump_missing_columns(make_ctx):
    ctx = make_ctx(close=[100] * 2, features={})
    mask = isolated_venue_pump(ctx)
    assert not mask.any()
