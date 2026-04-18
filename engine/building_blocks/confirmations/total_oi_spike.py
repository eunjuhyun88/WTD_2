"""Confirmation: total multi-exchange OI spikes or collapses.

Reads `total_oi_change_1h` / `total_oi_change_24h` from `ctx.features`.
These columns are provided by `fetch_exchange_oi` (Binance + Bybit + OKX
aggregated) via the per-symbol registry — unlike `oi_change` which reads
only Binance perp OI, this block uses the full multi-venue aggregate.

Use case:
  "increase" + short window → leveraged longs piling in (euphoria/overextension)
  "decrease" + short window → mass deleveraging / short squeeze resolution
  "decrease" 24h + big threshold → long liquidation cascade
"""
from __future__ import annotations

from typing import Literal

import pandas as pd

from building_blocks.context import Context

Direction = Literal["increase", "decrease"]
Window = Literal["1h", "24h"]


def total_oi_spike(
    ctx: Context,
    *,
    threshold: float = 0.05,
    direction: Direction = "increase",
    window: Window = "1h",
) -> pd.Series:
    """Return True where total multi-exchange OI change meets threshold.

    Args:
        ctx:       Per-symbol Context.
        threshold: Minimum absolute fractional change (e.g. 0.05 = 5%).
        direction: "increase" = OI growing (leveraged positioning).
                   "decrease" = OI collapsing (deleveraging / liquidation).
        window:    "1h" or "24h" lookback.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if threshold <= 0:
        raise ValueError(f"threshold must be > 0, got {threshold}")

    col = f"total_oi_change_{window}"
    oi = ctx.features.get(col, pd.Series(0.0, index=ctx.features.index))
    if hasattr(oi, "fillna"):
        oi = oi.fillna(0.0)

    if direction == "increase":
        return (oi >= threshold).astype(bool)
    else:
        return (oi <= -threshold).astype(bool)
