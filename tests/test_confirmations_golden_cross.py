"""Tests for building_blocks.confirmations.golden_cross."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import golden_cross


def test_cross_detected_single_bar(make_ctx):
    # Downtrend fast<slow, then uptrend → fast crosses above slow.
    down = [150.0 - i * 2.0 for i in range(30)]
    up = [90.0 + i * 4.0 for i in range(20)]
    close = down + up
    ctx = make_ctx(close=close)
    mask = golden_cross(ctx, fast=5, slow=20)
    n_true = int(mask.sum())
    assert n_true == 1, f"expected exactly 1 cross bar, got {n_true}"


def test_pure_downtrend_no_cross(make_ctx):
    close = [150.0 - i for i in range(50)]
    ctx = make_ctx(close=close)
    mask = golden_cross(ctx, fast=5, slow=20)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 50)
    with pytest.raises(ValueError):
        golden_cross(ctx, fast=0, slow=20)
    with pytest.raises(ValueError):
        golden_cross(ctx, fast=30, slow=20)
