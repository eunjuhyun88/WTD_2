"""Tests for building_blocks.confirmations.dead_cross."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import dead_cross


def test_cross_detected_single_bar(make_ctx):
    # Uptrend fast>slow, then strong dump → fast drops below slow.
    # Use fast=5, slow=20 for a short test series.
    up = [100.0 + i * 2.0 for i in range(30)]
    down = [160.0 - i * 4.0 for i in range(20)]
    close = up + down
    ctx = make_ctx(close=close)
    mask = dead_cross(ctx, fast=5, slow=20)
    # Somewhere in the down section, the cross happens. At MOST 1 bar True.
    n_true = int(mask.sum())
    assert n_true == 1, f"expected exactly 1 cross bar, got {n_true}"


def test_pure_uptrend_no_cross(make_ctx):
    close = [100.0 + i for i in range(50)]
    ctx = make_ctx(close=close)
    mask = dead_cross(ctx, fast=5, slow=20)
    assert not mask.any()


def test_flat_price_no_cross(make_ctx):
    # Flat price → fast and slow EMAs stay equal → never crosses below.
    # (A pure downtrend from bar 0 is not a valid "no cross" scenario
    # because EMAs initialize equal at bar 0 and diverge on bar 1 which
    # IS a legitimate cross. In real use, feature_calc drops the first
    # MIN_HISTORY_BARS anyway so this initialization noise is filtered.)
    close = [100.0] * 50
    ctx = make_ctx(close=close)
    mask = dead_cross(ctx, fast=5, slow=20)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 50)
    with pytest.raises(ValueError):
        dead_cross(ctx, fast=0, slow=20)
    with pytest.raises(ValueError):
        dead_cross(ctx, fast=20, slow=20)
    with pytest.raises(ValueError):
        dead_cross(ctx, fast=30, slow=20)
