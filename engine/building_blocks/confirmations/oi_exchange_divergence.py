"""Confirmation: OI concentration on a single exchange is unusually high.

Reads `oi_exchange_conc` and `total_oi_change_1h` from `ctx.features`.

`oi_exchange_conc` = max_single_exchange_oi / total_perp_oi.
  Normal range: 0.5–0.65 (Binance typically dominates at ~55%)
  High (>0.80): one exchange is running the move — possible manipulation
                or venue-specific liquidation cascade

Composite signal interpretation:
  HIGH concentration + OI spike = single-venue leveraged move (less reliable)
  HIGH concentration + OI drop  = one venue deleveraging while others hold
  LOW concentration  + OI spike = broad consensus across venues (stronger signal)

Anchor:
  Exchange divergence analysis popularised by on-chain analysts to detect
  "Binance-only" pumps vs genuine multi-venue accumulation. A move confirmed
  on Binance + Bybit + OKX simultaneously is structurally stronger.
"""
from __future__ import annotations

from typing import Literal

import pandas as pd

from building_blocks.context import Context

Mode = Literal["high_concentration", "low_concentration"]


def oi_exchange_divergence(
    ctx: Context,
    *,
    mode: Mode = "low_concentration",
    conc_threshold: float = 0.75,
    require_oi_spike: bool = True,
    oi_spike_threshold: float = 0.03,
) -> pd.Series:
    """Return True where exchange OI concentration meets the requested mode.

    Args:
        ctx:                Per-symbol Context.
        mode:               "low_concentration"  → broad multi-venue agreement
                                (conc < conc_threshold) — stronger signal
                            "high_concentration" → single venue dominates
                                (conc >= conc_threshold) — possible manipulation
        conc_threshold:     Concentration cutoff. Default 0.75 = one exchange
                            holds ≥75% of total OI.
        require_oi_spike:   If True, also require total_oi_change_1h ≥
                            oi_spike_threshold (only flag when OI is actually
                            moving, not idle periods).
        oi_spike_threshold: Minimum 1h OI change to consider "active".

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if mode not in ("high_concentration", "low_concentration"):
        raise ValueError(f"mode must be 'high_concentration' or 'low_concentration', got {mode!r}")

    conc = ctx.features.get("oi_exchange_conc", pd.Series(1.0, index=ctx.features.index)).fillna(1.0)
    mask = conc >= conc_threshold if mode == "high_concentration" else conc < conc_threshold

    if require_oi_spike:
        oi_chg = ctx.features.get("total_oi_change_1h", pd.Series(0.0, index=ctx.features.index)).fillna(0.0)
        mask = mask & (oi_chg.abs() >= oi_spike_threshold)

    return mask.astype(bool)
