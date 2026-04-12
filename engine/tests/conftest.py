"""Shared pytest fixtures for cogochi-autoresearch tests.

Currently provides:
  - make_ctx: factory that builds a Context from a close-price sequence,
    with synthetic OHLCV and a 1:1 features index (no warmup skip). Used
    by all building_blocks tests.
"""
from __future__ import annotations

from typing import Optional

import pandas as pd
import pytest

from building_blocks.context import Context


@pytest.fixture
def make_ctx():
    """Build a Context from a price sequence (and optional OHLCV overrides).

    Usage:
        def test_something(make_ctx):
            ctx = make_ctx(close=[100, 101, 102, 99, 105])
            mask = some_block(ctx, ...)

    The synthetic klines use:
        open  = close shifted back one (open[0] = close[0])
        high  = close * 1.01
        low   = close * 0.99
        volume = constant 1000
        taker_buy_base_volume = constant 500
    unless overridden by the `overrides` dict.

    Features is a dummy single-column DataFrame with the same index as
    klines (no warmup skip), so tests can assert mask alignment 1:1 with
    the input.
    """

    def _builder(
        close: list[float],
        *,
        symbol: str = "TEST",
        start: str = "2025-01-01",
        freq: str = "1h",
        overrides: Optional[dict] = None,
        features: Optional[dict] = None,
    ) -> Context:
        n = len(close)
        idx = pd.date_range(start, periods=n, freq=freq, tz="UTC")
        open_ = [close[0]] + close[:-1]
        klines = pd.DataFrame(
            {
                "open": open_,
                "high": [c * 1.01 for c in close],
                "low": [c * 0.99 for c in close],
                "close": list(close),
                "volume": [1000.0] * n,
                "taker_buy_base_volume": [500.0] * n,
            },
            index=idx,
        )
        if overrides:
            for col, values in overrides.items():
                if len(values) != n:
                    raise ValueError(
                        f"override {col!r} has len {len(values)}, expected {n}"
                    )
                klines[col] = values
        feat_df = pd.DataFrame({"_dummy": [0.0] * n}, index=idx)
        if features:
            for col, values in features.items():
                if len(values) != n:
                    raise ValueError(
                        f"features override {col!r} has len {len(values)}, expected {n}"
                    )
                feat_df[col] = values
        return Context(klines=klines, features=feat_df, symbol=symbol)

    return _builder
