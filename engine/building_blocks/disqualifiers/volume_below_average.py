"""Disqualifier: current volume is far below the recent baseline.

Common pairing with breakout triggers: "this is a new high, but on tiny
volume — probably a false break." Returns True where volume is below
`multiple × mean(past vs_window)`, meaning the composer should reject.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def volume_below_average(
    ctx: Context,
    *,
    multiple: float = 0.5,
    vs_window: int = 24,
) -> pd.Series:
    """Return a bool Series where volume is below `multiple` × the mean
    of the past `vs_window` bars' volume (disqualify).

    Past-only: the baseline window excludes the current bar.

    Args:
        ctx: Per-symbol Context.
        multiple: Disqualify when volume < multiple × baseline.
            Default 0.5 (disqualify if less than half the baseline).
        vs_window: Baseline window length in bars. Default 24.

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True = disqualify.
    """
    if multiple <= 0:
        raise ValueError(f"multiple must be > 0, got {multiple}")
    if vs_window <= 0:
        raise ValueError(f"vs_window must be > 0, got {vs_window}")

    vol = ctx.klines["volume"]
    baseline = vol.shift(1).rolling(vs_window, min_periods=vs_window).mean()
    below = vol < multiple * baseline
    return below.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
