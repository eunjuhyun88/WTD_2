"""Confirmation: realized range compresses after a dump impulse."""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def post_dump_compression(
    ctx: Context,
    *,
    recent_bars: int = 4,
    baseline_bars: int = 8,
    compression_ratio: float = 0.75,
) -> pd.Series:
    """Return True where recent realized range is below the earlier baseline."""
    if recent_bars < 1:
        raise ValueError(f"recent_bars must be >= 1, got {recent_bars}")
    if baseline_bars < 2:
        raise ValueError(f"baseline_bars must be >= 2, got {baseline_bars}")
    if compression_ratio <= 0:
        raise ValueError(
            f"compression_ratio must be > 0, got {compression_ratio}"
        )

    realized_range = ((ctx.klines["high"] - ctx.klines["low"]) / ctx.klines["close"]).abs()
    recent = realized_range.rolling(recent_bars, min_periods=recent_bars).mean()
    baseline = realized_range.shift(recent_bars).rolling(
        baseline_bars, min_periods=baseline_bars
    ).mean()
    compressed = recent <= baseline * compression_ratio
    return compressed.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
