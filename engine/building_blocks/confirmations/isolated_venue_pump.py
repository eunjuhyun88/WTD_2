"""Confirmation: a single venue is running a price pump the rest do not confirm.

W-0122 Pillar 3. Weaker/noisier sibling of ``venue_oi_divergence`` — uses
per-venue 1h *price* deltas rather than OI, capturing cases where one
exchange's perp mark is diverging from spot aggregate (a common
liquidation-hunt setup).

Reads per-venue price delta columns from `ctx.features`:
  - ``binance_price_change_1h``
  - ``bybit_price_change_1h``
  - ``okx_price_change_1h``
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def isolated_venue_pump(
    ctx: Context,
    *,
    leader_threshold: float = 0.008,    # leader venue +0.8%/1h
    follower_max: float = 0.002,        # followers within ±0.2%
) -> pd.Series:
    """True where exactly one venue is moving sharply while the others are flat."""
    f = ctx.features
    cols = ["binance_price_change_1h", "bybit_price_change_1h", "okx_price_change_1h"]
    series = [f.get(c) for c in cols]
    if any(s is None for s in series):
        return pd.Series(False, index=ctx.bars.index)

    # For each bar, count how many venues exceed the leader threshold.
    exceeds = pd.concat(
        [(s.abs() >= leader_threshold) for s in series],
        axis=1,
    )
    followers_flat = pd.concat(
        [(s.abs() <= follower_max) for s in series],
        axis=1,
    )
    # Exactly one leader AND the other two are flat.
    return (
        (exceeds.sum(axis=1) == 1) & (followers_flat.sum(axis=1) == 2)
    ).fillna(False)
