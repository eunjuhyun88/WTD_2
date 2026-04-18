"""Confirmation: OKX on-chain smart money is accumulating this token.

Calls OKX Signal API (via TTL cache) to check if tracked Smart Money /
KOL / Whale wallets made net-positive buy trades in the last 24h for
the token corresponding to ctx.symbol.

Applies only to on-chain tokens (Solana/ETH/BSC/Base). Returns all-False
for BTC, ETH CEX perps, or any symbol not in the SYMBOL_CHAIN_MAP.

This block is self-contained: it calls the OKX API at score time.
It does NOT read from ctx.features (no registry column needed).

Anchor:
    OKX Onchain OS — "Smart Money" wallets = sustained top-quartile
    win-rate + PnL over rolling 30d window, tracked across DEX activity.
    Analogous to Nansen Smart Money label used by on-chain analysts.
"""
from __future__ import annotations

import time
import pandas as pd

from building_blocks.context import Context
from data_cache.fetch_okx_smart_money import (
    compute_smart_money_score,
    get_smart_money_signals,
)


def smart_money_accumulation(
    ctx: Context,
    *,
    wallet_types: str = "1,2,3",
    min_amount_usd: float = 1000.0,
    max_age_hours: float = 24.0,
    min_buy_wallets: int = 2,
) -> pd.Series:
    """Return True on current bar if smart money is accumulating ctx.symbol.

    Because OKX Signal API has no historical data, only the most recent
    bar(s) within max_age_hours can be True. Older bars are always False.

    Args:
        ctx:             Per-symbol Context.
        wallet_types:    "1,2,3" = Smart Money + KOL + Whale (OKX type IDs).
        min_amount_usd:  Minimum signal trade size in USD.
        max_age_hours:   How far back to look for signals.
        min_buy_wallets: Minimum distinct buying wallets required.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
        True only on bars within max_age_hours AND smart money is net-buying.
    """
    false_series = pd.Series(False, index=ctx.features.index, dtype=bool)

    signals = get_smart_money_signals(
        ctx.symbol,
        wallet_types=wallet_types,
        min_amount_usd=min_amount_usd,
        max_age_hours=max_age_hours,
    )
    if not signals:
        return false_series

    score = compute_smart_money_score(signals)
    if not score["accumulating"] or score["buy_wallet_count"] < min_buy_wallets:
        return false_series

    # Mark bars that fall within the signal age window as True.
    # Convert to UTC seconds for comparison (avoids ns/us ambiguity).
    cutoff_s = time.time() - max_age_hours * 3600
    # Index is datetime64[us] → int64 gives microseconds; divide by 1e6 for seconds
    bar_seconds = ctx.features.index.astype("int64") / 1e6
    mask = bar_seconds >= cutoff_s
    result = pd.Series(False, index=ctx.features.index, dtype=bool)
    result[mask] = True
    return result
