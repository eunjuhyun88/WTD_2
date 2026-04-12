"""Confirmation: funding rate is stretched in one direction.

Reads `funding_rate` from `ctx.features` (provided by
`scanner.feature_calc.compute_features_table`). Uses the perp data layer;
until historical funding is wired in, the column is zero and this block
will never match. Classic use: "long_overheat" = funding positive and
large → crowded longs paying shorts, fertile reversal ground.
"""
from __future__ import annotations

from typing import Literal

import pandas as pd

from building_blocks.context import Context

Direction = Literal["long_overheat", "short_overheat"]


def funding_extreme(
    ctx: Context,
    *,
    threshold: float = 0.0010,
    direction: Direction = "long_overheat",
) -> pd.Series:
    """Return a bool Series where funding_rate meets `threshold` in the
    requested `direction`.

    Args:
        ctx: Per-symbol Context.
        threshold: Absolute funding-rate magnitude, e.g. 0.0010 for 10 bps
            per funding interval. Must be > 0.
        direction: "long_overheat" matches bars with funding_rate >=
            threshold (longs pay shorts). "short_overheat" matches bars
            with funding_rate <= -threshold (shorts pay longs).

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if threshold <= 0:
        raise ValueError(f"threshold must be > 0, got {threshold}")
    if direction not in ("long_overheat", "short_overheat"):
        raise ValueError(
            f"direction must be 'long_overheat' or 'short_overheat', got {direction!r}"
        )

    fr = ctx.features["funding_rate"]
    if direction == "long_overheat":
        mask = fr >= threshold
    else:
        mask = fr <= -threshold
    return mask.astype(bool)
