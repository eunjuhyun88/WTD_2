"""Entry: current bar has an upper wick ≥ body_ratio × body length.

Mirror of long_lower_wick. A long upper wick (shooting star / inverted
hammer) signals that buyers pushed price up intrabar then got faded.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def long_upper_wick(
    ctx: Context,
    *,
    body_ratio: float = 2.0,
) -> pd.Series:
    """Return a bool Series where the current bar's upper wick is
    ≥ `body_ratio` × the body length.

    Args:
        ctx: Per-symbol Context.
        body_ratio: Minimum (wick / body) ratio. Default 2.0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if body_ratio <= 0:
        raise ValueError(f"body_ratio must be > 0, got {body_ratio}")

    open_ = ctx.klines["open"]
    close = ctx.klines["close"]
    high = ctx.klines["high"]

    body_max = pd.concat([open_, close], axis=1).max(axis=1)
    upper_wick = high - body_max
    body = (close - open_).abs()

    mask = upper_wick >= body_ratio * body
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
