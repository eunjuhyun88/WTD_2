"""Trigger: current volume ≥ multiple × mean(volume over past vs_window bars).

Use case: "something just traded much heavier than usual." Common
companion signal to price-only triggers — volume adds conviction.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def volume_spike(
    ctx: Context,
    *,
    multiple: float = 5.0,
    vs_window: int = 24,
) -> pd.Series:
    """Return a bool Series where this bar's volume ≥ `multiple` × the
    mean of the past `vs_window` bars' volume.

    Past-only: the comparison window is [t-vs_window : t-1], excluding
    the current bar.

    Args:
        ctx: Per-symbol Context.
        multiple: Multiplier vs average, e.g. 3.0 for 3x avg volume. Must be > 0.
        vs_window: Past window length in bars. Must be > 0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if multiple <= 0:
        raise ValueError(f"multiple must be > 0, got {multiple}")
    if vs_window <= 0:
        raise ValueError(f"vs_window must be > 0, got {vs_window}")

    vol = ctx.klines["volume"]
    avg = vol.shift(1).rolling(vs_window, min_periods=vs_window).mean()
    spike = vol >= multiple * avg
    return spike.reindex(ctx.features.index, fill_value=False).astype(bool)
