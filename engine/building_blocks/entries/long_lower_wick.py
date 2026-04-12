"""Entry: current bar has a lower wick ≥ body_ratio × body length.

Interpretation:
    lower wick = min(open, close) - low
    body       = |close - open|
    match      = lower_wick >= body_ratio * body

A long lower wick (hammer / pin bar) is a classic rejection signal:
price traded down significantly intrabar then got pushed back up.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def long_lower_wick(
    ctx: Context,
    *,
    body_ratio: float = 2.0,
) -> pd.Series:
    """Return a bool Series where the current bar's lower wick is
    ≥ `body_ratio` × the body length.

    Dojis (body ≈ 0): any positive lower wick satisfies the inequality
    since `wick >= body_ratio * 0` = `wick >= 0`.

    Args:
        ctx: Per-symbol Context.
        body_ratio: Minimum (wick / body) ratio. Default 2.0 = wick at
            least twice the body. Must be > 0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if body_ratio <= 0:
        raise ValueError(f"body_ratio must be > 0, got {body_ratio}")

    open_ = ctx.klines["open"]
    close = ctx.klines["close"]
    low = ctx.klines["low"]

    body_min = pd.concat([open_, close], axis=1).min(axis=1)
    lower_wick = body_min - low
    body = (close - open_).abs()

    mask = lower_wick >= body_ratio * body
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
