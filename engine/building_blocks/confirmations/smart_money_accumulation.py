"""Confirmation: OKX on-chain smart money is accumulating this token.

Uses persistent historical cache of OKX Smart Money / KOL / Whale signals
(build via fetch_okx_historical.fetch_and_cache_signals).

This provides 24+ hours of accumulated data instead of just real-time API calls,
improving pattern validation reliability during backtests and walk-forward CV.

Applies only to on-chain tokens (Solana/ETH/BSC/Base). Returns all-False
for BTC, ETH CEX perps, or any symbol not in the SYMBOL_CHAIN_MAP.

Anchor:
    OKX Onchain OS — "Smart Money" wallets = sustained top-quartile
    win-rate + PnL over rolling 30d window, tracked across DEX activity.
    Analogous to Nansen Smart Money label used by on-chain analysts.
"""
from __future__ import annotations

import time
import pandas as pd

from building_blocks.context import Context
from data_cache.fetch_okx_smart_money import compute_smart_money_score
from data_cache.fetch_okx_historical import load_signals_from_disk


def smart_money_accumulation(
    ctx: Context,
    *,
    wallet_types: str = "1,2,3",
    min_amount_usd: float = 1000.0,
    max_age_hours: float = 24.0,
    min_buy_wallets: int = 2,
) -> pd.Series:
    """Return True on current bar if smart money is accumulating ctx.symbol.

    Uses persistent historical cache (load_signals_from_disk) which accumulates
    24+ hours of OKX smart money data. Provides better backtesting reliability
    than live API calls.

    Args:
        ctx:             Per-symbol Context.
        wallet_types:    "1,2,3" = Smart Money + KOL + Whale (OKX type IDs).
        min_amount_usd:  Minimum signal trade size in USD (unused, for API compat).
        max_age_hours:   How far back to look for signals.
        min_buy_wallets: Minimum distinct buying wallets required.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
        True only on bars within max_age_hours AND smart money is net-buying.
    """
    false_series = pd.Series(False, index=ctx.features.index, dtype=bool)

    # Load cached historical signals (preferred) instead of live API
    df = load_signals_from_disk(ctx.symbol)
    if df.empty:
        return false_series

    # Filter by age window
    cutoff = pd.Timestamp.now(tz="UTC") - pd.Timedelta(hours=max_age_hours)
    recent_signals = df[df["timestamp"] >= cutoff]
    if recent_signals.empty:
        return false_series

    # Convert DataFrame to list of dicts for compute_smart_money_score()
    signals = recent_signals.to_dict("records")

    score = compute_smart_money_score(signals)
    if not score["accumulating"] or score["buy_wallet_count"] < min_buy_wallets:
        return false_series

    # Mark bars within the signal age window as True.
    # Use .to_pydatetime() → .timestamp() to avoid ns/us int-cast ambiguity.
    cutoff_s = time.time() - max_age_hours * 3600
    bar_seconds = pd.Series(
        [ts.timestamp() for ts in ctx.features.index.to_pydatetime()],
        index=ctx.features.index,
    )
    return (bar_seconds >= cutoff_s).astype(bool)
