"""Confirmation: DEX on-chain buy pressure exceeds threshold.

Measures the ratio of buy transactions to total transactions on DEX
(PancakeSwap/Uniswap/Aerodrome) over 24h. Unlike CEX taker_buy_ratio
(which can be gamed), DEX tx counts reflect actual on-chain wallet activity.

High dex_buy_pct during a price suppression phase = smart wallets
accumulating via DEX while futures keep spot price down.

Requires dex_buy_pct column in features (provided by DEX_SOURCES registry).
Gracefully returns False if DEX data is unavailable (no dex_buy_pct column
or all zeros — token may be CEX-only, not on Alpha).
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def dex_buy_pressure(
    ctx: Context,
    *,
    threshold: float = 0.55,
    min_volume: float = 10_000.0,
) -> pd.Series:
    """Return bool Series where DEX buy pressure is elevated.

    Fires when:
      1. dex_buy_pct >= threshold (more buys than sells on DEX)
      2. dex_volume_h24 >= min_volume (minimum liquidity filter, avoids noise)

    Args:
        ctx:        Per-symbol Context.
        threshold:  Min buy transaction ratio (default 0.55 = 55% buys).
        min_volume: Min 24h DEX volume USD to avoid illiquid noise.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
        All False if dex_buy_pct not in features (CEX-only token).
    """
    feats = ctx.features

    if "dex_buy_pct" not in feats.columns:
        return pd.Series(False, index=feats.index, dtype=bool)

    buy_pct = feats["dex_buy_pct"]
    volume = feats.get("dex_volume_h24", pd.Series(0.0, index=feats.index))

    high_buys = buy_pct >= threshold
    sufficient_volume = volume >= min_volume

    result = high_buys & sufficient_volume

    # If all dex_buy_pct values are exactly 0.5 (default padding), skip
    if (buy_pct == 0.5).all():
        return pd.Series(False, index=feats.index, dtype=bool)

    return result.reindex(feats.index, fill_value=False).astype(bool)
