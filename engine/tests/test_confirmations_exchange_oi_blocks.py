"""Tests for total_oi_spike and oi_exchange_divergence blocks."""
from __future__ import annotations

import pytest

from building_blocks.confirmations.total_oi_spike import total_oi_spike
from building_blocks.confirmations.oi_exchange_divergence import oi_exchange_divergence


# ── total_oi_spike ────────────────────────────────────────────────────────────

def test_total_oi_spike_increase(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={"total_oi_change_1h": [0.01, 0.06, 0.03, 0.08]},
    )
    mask = total_oi_spike(ctx, threshold=0.05, direction="increase", window="1h")
    assert list(mask) == [False, True, False, True]


def test_total_oi_spike_decrease(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={"total_oi_change_1h": [-0.01, -0.07, 0.02, -0.05]},
    )
    mask = total_oi_spike(ctx, threshold=0.05, direction="decrease", window="1h")
    assert list(mask) == [False, True, False, True]


def test_total_oi_spike_zero_default(make_ctx):
    ctx = make_ctx(close=[100] * 3, features={})
    mask = total_oi_spike(ctx, threshold=0.05)
    assert not mask.any()


def test_total_oi_spike_invalid_threshold(make_ctx):
    ctx = make_ctx(close=[100, 100], features={})
    with pytest.raises(ValueError):
        total_oi_spike(ctx, threshold=0.0)


# ── oi_exchange_divergence ────────────────────────────────────────────────────

def test_divergence_low_concentration_fires_on_broad_move(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={
            "oi_exchange_conc": [0.55, 0.80, 0.60, 0.50],
            "total_oi_change_1h": [0.05, 0.05, 0.05, 0.05],
        },
    )
    mask = oi_exchange_divergence(ctx, mode="low_concentration", conc_threshold=0.75)
    # bar0: conc=0.55 < 0.75, oi spike → True
    # bar1: conc=0.80 >= 0.75 → False
    # bar2: conc=0.60 < 0.75, oi spike → True
    # bar3: conc=0.50 < 0.75, oi spike → True
    assert list(mask) == [True, False, True, True]


def test_divergence_high_concentration_detects_single_venue(make_ctx):
    ctx = make_ctx(
        close=[100] * 3,
        features={
            "oi_exchange_conc": [0.55, 0.85, 0.92],
            "total_oi_change_1h": [0.04, 0.04, 0.04],
        },
    )
    mask = oi_exchange_divergence(ctx, mode="high_concentration", conc_threshold=0.75)
    assert list(mask) == [False, True, True]


def test_divergence_require_oi_spike_filters_idle(make_ctx):
    ctx = make_ctx(
        close=[100] * 3,
        features={
            "oi_exchange_conc": [0.50, 0.50, 0.50],
            "total_oi_change_1h": [0.01, 0.05, 0.10],
        },
    )
    mask = oi_exchange_divergence(
        ctx, mode="low_concentration", conc_threshold=0.75,
        require_oi_spike=True, oi_spike_threshold=0.03,
    )
    # bar0: oi_chg=0.01 < 0.03 → False (idle)
    # bar1: oi_chg=0.05 >= 0.03 → True
    # bar2: oi_chg=0.10 >= 0.03 → True
    assert list(mask) == [False, True, True]


def test_divergence_no_spike_required(make_ctx):
    ctx = make_ctx(
        close=[100] * 3,
        features={
            "oi_exchange_conc": [0.50, 0.50, 0.50],
            "total_oi_change_1h": [0.0, 0.0, 0.0],
        },
    )
    mask = oi_exchange_divergence(
        ctx, mode="low_concentration", conc_threshold=0.75,
        require_oi_spike=False,
    )
    assert mask.all()


def test_divergence_invalid_mode(make_ctx):
    ctx = make_ctx(close=[100, 100], features={})
    with pytest.raises(ValueError):
        oi_exchange_divergence(ctx, mode="neutral")  # type: ignore
