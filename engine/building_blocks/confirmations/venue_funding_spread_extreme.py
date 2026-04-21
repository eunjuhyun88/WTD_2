"""Confirmation: per-venue funding spread unusually wide.

W-0122 Pillar 3. When Binance funding and Bybit funding diverge past a
threshold, one venue is over-loaded relative to the pack — either an
arb opportunity or an approaching liquidation cascade.

Reads per-venue funding columns from `ctx.features`:
  - ``binance_funding``
  - ``bybit_funding``
  - ``okx_funding``

Populated by market/derivatives routes + Coinalyze.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def venue_funding_spread_extreme(
    ctx: Context,
    *,
    spread_threshold: float = 0.0003,  # 0.03% per 1h funding period
) -> pd.Series:
    """Return True where (max − min) funding across venues exceeds threshold."""
    f = ctx.features
    binance = f.get("binance_funding")
    bybit = f.get("bybit_funding")
    okx = f.get("okx_funding")

    if binance is None or bybit is None or okx is None:
        return pd.Series(False, index=ctx.features.index)

    stacked = pd.concat([binance, bybit, okx], axis=1)
    spread = stacked.max(axis=1) - stacked.min(axis=1)
    return (spread >= spread_threshold).fillna(False)
