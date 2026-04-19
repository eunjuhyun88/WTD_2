"""Tests for building_blocks.confirmations.delta_flip_positive."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import delta_flip_positive


def test_flip_detected_after_selling_then_buying(make_ctx):
    """Prior 6 bars net-selling (tbv/vol = 0.3), current 6 bars net-buying (0.7) → True at bar 11."""
    window = 6
    # 12 bars total: 6 selling, then 6 buying
    vols = [1000.0] * 12
    tbv = [300.0] * window + [700.0] * window
    closes = [100.0] * 12
    ctx = make_ctx(
        close=closes,
        overrides={"volume": vols, "taker_buy_base_volume": tbv},
    )
    mask = delta_flip_positive(
        ctx, window=window, flip_from_below=0.50, flip_to_at_least=0.55
    )
    # The flip becomes observable once the current rolling window covers
    # all 6 buying bars (idx 11) AND the shifted prior window covers the
    # 6 selling bars (which for shift=6 means idx 11 — prior window [0..5]).
    assert bool(mask.iloc[window * 2 - 1]) is True


def test_no_flip_when_always_neutral(make_ctx):
    """Constant neutral ratio 0.5 → never flips."""
    vols = [1000.0] * 12
    tbv = [500.0] * 12
    ctx = make_ctx(
        close=[100.0] * 12,
        overrides={"volume": vols, "taker_buy_base_volume": tbv},
    )
    mask = delta_flip_positive(
        ctx, window=6, flip_from_below=0.50, flip_to_at_least=0.55
    )
    assert not mask.any()


def test_no_flip_when_prior_already_buying(make_ctx):
    """Prior window already at 0.60 → no flip even if current is 0.70."""
    window = 6
    vols = [1000.0] * 12
    tbv = [600.0] * window + [700.0] * window
    ctx = make_ctx(
        close=[100.0] * 12,
        overrides={"volume": vols, "taker_buy_base_volume": tbv},
    )
    mask = delta_flip_positive(
        ctx, window=window, flip_from_below=0.50, flip_to_at_least=0.55
    )
    assert not mask.any()


def test_insufficient_history_returns_false(make_ctx):
    """Need at least 2*window bars for a valid flip comparison."""
    ctx = make_ctx(close=[100.0] * 5)
    mask = delta_flip_positive(ctx, window=6)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 15)
    with pytest.raises(ValueError):
        delta_flip_positive(ctx, window=1)
    with pytest.raises(ValueError):
        delta_flip_positive(ctx, window=6, flip_from_below=0.0)
    with pytest.raises(ValueError):
        delta_flip_positive(ctx, window=6, flip_to_at_least=1.0)
    with pytest.raises(ValueError):
        # to_at_least < from_below is invalid
        delta_flip_positive(
            ctx, window=6, flip_from_below=0.60, flip_to_at_least=0.50
        )


def test_below_threshold_does_not_flip(make_ctx):
    """Current ratio exactly at 0.54 but threshold is 0.55 → no flip."""
    window = 6
    vols = [1000.0] * 12
    tbv = [300.0] * window + [540.0] * window
    ctx = make_ctx(
        close=[100.0] * 12,
        overrides={"volume": vols, "taker_buy_base_volume": tbv},
    )
    mask = delta_flip_positive(
        ctx, window=window, flip_from_below=0.50, flip_to_at_least=0.55
    )
    assert not mask.any()
