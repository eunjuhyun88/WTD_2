"""Confirmation: Coinbase Premium Index (CPI) is positive and elevated.

Reads `coinbase_premium` and `coinbase_premium_norm` from `ctx.features`.
Both columns are provided by `data_cache.fetch_coinbase.fetch_coinbase_premium`
via the global macro registry (daily cadence, forward-filled to all bars).

Signal interpretation:
    coinbase_premium > 0 AND coinbase_premium_norm > threshold
    → US/institutional buyers are paying above Binance global spot price
    → On-chain confirmation of institutional accumulation

Anchor:
    CryptoQuant CPI popularised by Ki Young Ju (2020): sustained positive
    Coinbase premium precedes BTC appreciation on 12-24h horizon.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def coinbase_premium_positive(
    ctx: Context,
    *,
    min_premium: float = 0.0,
    min_norm: float = 0.5,
) -> pd.Series:
    """Return True where Coinbase premium is positive and above z-score threshold.

    Args:
        ctx: Per-symbol Context.
        min_premium: Minimum raw premium (fraction). Default 0.0 = any positive.
        min_norm: Minimum z-score threshold. Default 0.5 = slightly above average.
            Use 1.0 for elevated, 1.5 for strongly elevated.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    premium = ctx.features.get("coinbase_premium", pd.Series(0.0, index=ctx.features.index)).fillna(0.0)
    norm = ctx.features.get("coinbase_premium_norm", pd.Series(0.0, index=ctx.features.index)).fillna(0.0)
    return ((premium > min_premium) & (norm >= min_norm)).astype(bool)
