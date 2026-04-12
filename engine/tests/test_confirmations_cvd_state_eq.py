"""Tests for building_blocks.confirmations.cvd_state_eq."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import cvd_state_eq


def test_buying_matches(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={"cvd_state": ["buying", "selling", "buying", "neutral"]},
    )
    mask = cvd_state_eq(ctx, state="buying")
    assert list(mask) == [True, False, True, False]


def test_selling_matches(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={"cvd_state": ["buying", "selling", "buying", "selling"]},
    )
    mask = cvd_state_eq(ctx, state="selling")
    assert list(mask) == [False, True, False, True]


def test_neutral_matches(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100],
        features={"cvd_state": ["neutral", "buying", "neutral"]},
    )
    mask = cvd_state_eq(ctx, state="neutral")
    assert list(mask) == [True, False, True]


def test_invalid_state_raises(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={"cvd_state": ["buying", "selling"]},
    )
    with pytest.raises(ValueError):
        cvd_state_eq(ctx, state="bullish")  # type: ignore[arg-type]


def test_mask_index_aligns_with_features(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100],
        features={"cvd_state": ["buying", "buying", "buying"]},
    )
    mask = cvd_state_eq(ctx, state="buying")
    assert list(mask.index) == list(ctx.features.index)
    assert mask.dtype == bool
