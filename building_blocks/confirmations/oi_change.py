"""Confirmation: Open Interest change over a window crosses a threshold.

Reads `oi_change_1h` or `oi_change_24h` from `ctx.features` (provided by
`scanner.feature_calc.compute_features_table`). Uses the perp data layer
which, when historical OI is wired in, supplies per-bar fractional change
vs N hours ago. Until then the column is filled with zeros and this
block will neither match anywhere (increase) nor match everywhere
(decrease with threshold=0) — same behaviour as every perp-dependent
block during the data-stub phase.
"""
from __future__ import annotations

from typing import Literal

import pandas as pd

from building_blocks.context import Context

Direction = Literal["increase", "decrease"]
Window = Literal["1h", "24h"]


def oi_change(
    ctx: Context,
    *,
    threshold: float = 0.10,
    direction: Direction = "increase",
    window: Window = "1h",
) -> pd.Series:
    """Return a bool Series where OI change over `window` meets `threshold`
    in the requested `direction`.

    Args:
        ctx: Per-symbol Context.
        threshold: Minimum absolute fractional change, e.g. 0.10 for 10%.
            Must be > 0 — pass the size as a positive number; `direction`
            decides the sign of the comparison.
        direction: "increase" matches bars with oi_change_{window} >=
            threshold. "decrease" matches bars with oi_change_{window} <=
            -threshold.
        window: Which OI change column to read — "1h" or "24h".

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if threshold <= 0:
        raise ValueError(f"threshold must be > 0, got {threshold}")
    if direction not in ("increase", "decrease"):
        raise ValueError(
            f"direction must be 'increase' or 'decrease', got {direction!r}"
        )
    if window not in ("1h", "24h"):
        raise ValueError(f"window must be '1h' or '24h', got {window!r}")

    col = f"oi_change_{window}"
    oi = ctx.features[col]
    if direction == "increase":
        mask = oi >= threshold
    else:
        mask = oi <= -threshold
    return mask.astype(bool)
