"""Data source registry — single place to add new external data sources.

To add a new source:
  1. Write a fetcher in data_cache/fetch_xxx.py
  2. Import it here and append one DataSource entry to MACRO_SOURCES
     or ONCHAIN_SOURCES.
  3. Done. loader.py and feature_calc.py pick it up automatically.

DataSource fields:
  name        Unique identifier (used in logs).
  fetcher     Callable(days: int) -> pd.DataFrame | None
              Returns a daily-indexed DataFrame. None = graceful skip.
  columns     Column names this source contributes to the bundle.
  defaults    Neutral fill value per column (used when source is missing
              or returns NaN). Must cover every name in `columns`.
  scope       "global"     → one CSV shared across all symbols
                              (e.g. macro data independent of coin)
              "per_symbol" → one CSV per symbol
                              (e.g. on-chain data specific to BTC/ETH)
              "per_symbol" fetchers receive (symbol, days) as args.
  cache_file  Filename pattern for the CSV cache.
              Use "{symbol}" placeholder for per_symbol sources.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import pandas as pd


@dataclass(frozen=True)
class DataSource:
    name: str
    fetcher: Callable
    columns: list[str]
    defaults: dict[str, float]
    scope: str          # "global" | "per_symbol"
    cache_file: str     # filename or pattern with {symbol}


# ─── Import fetchers ────────────────────────────────────────────────────────

from data_cache.fetch_macro import (
    fetch_fear_greed,
    fetch_btc_dominance,
    fetch_macro_yahoo,
)
from data_cache.fetch_coinbase import fetch_coinbase_premium
from data_cache.fetch_exchange_oi import fetch_exchange_oi
from data_cache.fetch_onchain import (
    fetch_active_addresses,
    fetch_tx_count,
    fetch_mvrv_zscore,
    fetch_puell_multiple,
)
from data_cache.fetch_social import (
    fetch_coingecko_trending,
    fetch_binance_square_sentiment,
    fetch_coingecko_social_volume,
)
from data_cache.fetch_dexscreener import fetch_dex_token_data
from data_cache.fetch_bscscan import fetch_holder_concentration
from data_cache.fetch_venue_funding import fetch_venue_funding


# ─── Global macro sources (symbol-independent) ──────────────────────────────
# Each fetcher signature: (days: int) -> pd.DataFrame | None

MACRO_SOURCES: list[DataSource] = [
    DataSource(
        name="fear_greed",
        fetcher=fetch_fear_greed,
        columns=["fear_greed", "fear_greed_norm"],
        defaults={"fear_greed": 50.0, "fear_greed_norm": 0.0},
        scope="global",
        cache_file="src_fear_greed.csv",
    ),
    DataSource(
        name="btc_dominance",
        fetcher=fetch_btc_dominance,
        columns=["btc_dominance"],
        defaults={"btc_dominance": 50.0},
        scope="global",
        cache_file="src_btc_dominance.csv",
    ),
    DataSource(
        name="yahoo_macro",
        fetcher=fetch_macro_yahoo,
        columns=["dxy_close", "dxy_slope_5d", "vix_close", "spx_close", "spx_slope_5d"],
        defaults={
            "dxy_close": 100.0,
            "dxy_slope_5d": 0.0,
            "vix_close": 20.0,
            "spx_close": 5000.0,
            "spx_slope_5d": 0.0,
        },
        scope="global",
        cache_file="src_yahoo_macro.csv",
    ),
    DataSource(
        name="coinbase_premium",
        fetcher=fetch_coinbase_premium,
        columns=["coinbase_premium", "coinbase_premium_norm"],
        defaults={"coinbase_premium": 0.0, "coinbase_premium_norm": 0.0},
        scope="global",
        cache_file="src_coinbase_premium.csv",
    ),
    # ── W-0115 Alpha Universe: DexScreener discovery (global, chain-agnostic) ──
    # community_takeover and boost signals are polled separately via
    # fetch_alpha_universe.py — not registry-driven (no symbol dimension).
    # ── Add new global sources here ──────────────────────────────────────────
]

# ─── Per-symbol on-chain sources ─────────────────────────────────────────────
# Each fetcher signature: (symbol: str, days: int) -> pd.DataFrame | None

ONCHAIN_SOURCES: list[DataSource] = [
    DataSource(
        name="active_addresses",
        fetcher=fetch_active_addresses,
        columns=["active_addr", "active_addr_norm"],
        defaults={"active_addr": 0.0, "active_addr_norm": 0.5},
        scope="per_symbol",
        cache_file="src_{symbol}_active_addr.csv",
    ),
    DataSource(
        name="tx_count",
        fetcher=fetch_tx_count,
        columns=["tx_count"],
        defaults={"tx_count": 0.0},
        scope="per_symbol",
        cache_file="src_{symbol}_tx_count.csv",
    ),
    DataSource(
        name="mvrv_zscore",
        fetcher=fetch_mvrv_zscore,
        columns=["mvrv", "mvrv_zscore"],
        defaults={"mvrv": 1.0, "mvrv_zscore": 0.0},
        scope="per_symbol",
        cache_file="src_{symbol}_mvrv.csv",
    ),
    DataSource(
        name="puell_multiple",
        fetcher=fetch_puell_multiple,
        columns=["puell_multiple"],
        defaults={"puell_multiple": 1.0},
        scope="per_symbol",
        cache_file="src_{symbol}_puell.csv",
    ),
    DataSource(
        name="exchange_oi",
        fetcher=fetch_exchange_oi,
        columns=[
            "binance_oi", "bybit_oi", "okx_oi",
            "total_perp_oi", "oi_exchange_conc",
            "total_oi_change_1h", "total_oi_change_24h",
            "cme_oi",
        ],
        defaults={
            "binance_oi": 0.0,
            "bybit_oi": 0.0,
            "okx_oi": 0.0,
            "total_perp_oi": 0.0,
            "oi_exchange_conc": 1.0,
            "total_oi_change_1h": 0.0,
            "total_oi_change_24h": 0.0,
            "cme_oi": 0.0,
        },
        scope="per_symbol",
        cache_file="src_{symbol}_exchange_oi.csv",
    ),
    # ── W-0114 딸깍 전략: 소셜 신호 ─────────────────────────────────────────
    DataSource(
        name="exchange_funding",
        fetcher=fetch_venue_funding,
        columns=["binance_funding", "bybit_funding", "okx_funding"],
        defaults={"binance_funding": 0.0, "bybit_funding": 0.0, "okx_funding": 0.0},
        scope="per_symbol",
        cache_file="src_{symbol}_venue_funding.csv",
    ),
    DataSource(
        name="coingecko_trending",
        fetcher=fetch_coingecko_trending,
        columns=["coingecko_trending"],
        defaults={"coingecko_trending": 0.0},
        scope="per_symbol",
        cache_file="src_{symbol}_cg_trending.csv",
    ),
    DataSource(
        name="binance_square",
        fetcher=fetch_binance_square_sentiment,
        columns=["square_post_count", "square_spike"],
        defaults={"square_post_count": 0.0, "square_spike": 0.0},
        scope="per_symbol",
        cache_file="src_{symbol}_square.csv",
    ),
    DataSource(
        name="coingecko_social",
        fetcher=fetch_coingecko_social_volume,
        columns=["community_score", "sentiment_up_pct"],
        defaults={"community_score": 0.0, "sentiment_up_pct": 50.0},
        scope="per_symbol",
        cache_file="src_{symbol}_cg_social.csv",
    ),
]


# ─── Derived helpers used by loader.py and feature_calc.py ──────────────────

def all_macro_columns() -> list[str]:
    """All column names contributed by MACRO_SOURCES."""
    cols: list[str] = []
    for src in MACRO_SOURCES:
        cols.extend(src.columns)
    return cols


def all_onchain_columns() -> list[str]:
    """All column names contributed by ONCHAIN_SOURCES."""
    cols: list[str] = []
    for src in ONCHAIN_SOURCES:
        cols.extend(src.columns)
    return cols


def macro_defaults() -> dict[str, float]:
    """Merged neutral defaults for all macro columns."""
    d: dict[str, float] = {}
    for src in MACRO_SOURCES:
        d.update(src.defaults)
    return d


def onchain_defaults() -> dict[str, float]:
    """Merged neutral defaults for all on-chain columns."""
    d: dict[str, float] = {}
    for src in ONCHAIN_SOURCES:
        d.update(src.defaults)
    return d


# ─── DEX sources — per-symbol DEX market data (BSC/ETH/Base) ─────────────────
# Fetcher signature: (symbol: str, days: int) -> pd.DataFrame | None
# Provides on-chain trading signals unavailable from CEX klines.
# Primary use: Binance Alpha → Futures pump screening (W-0115).

DEX_SOURCES: list[DataSource] = [
    DataSource(
        name="dex_token",
        fetcher=fetch_dex_token_data,
        columns=[
            "dex_market_cap",
            "dex_fdv",
            "dex_liquidity_usd",
            "dex_volume_h24",
            "dex_buy_txns_h24",
            "dex_sell_txns_h24",
            "dex_buy_pct",
            "dex_price_change_h24",
            "dex_price_change_h6",
            "dex_has_twitter",
            "dex_boost_active",
            "dex_pair_age_days",
        ],
        defaults={
            "dex_market_cap":       0.0,
            "dex_fdv":              0.0,
            "dex_liquidity_usd":    0.0,
            "dex_volume_h24":       0.0,
            "dex_buy_txns_h24":     0.0,
            "dex_sell_txns_h24":    0.0,
            "dex_buy_pct":          0.5,
            "dex_price_change_h24": 0.0,
            "dex_price_change_h6":  0.0,
            "dex_has_twitter":      0.0,
            "dex_boost_active":     0.0,
            "dex_pair_age_days":    0.0,
        },
        scope="per_symbol",
        cache_file="src_{symbol}_dex.csv",
    ),
]

# ─── Chain sources — on-chain holder/wallet data ──────────────────────────────
# Requires BSCSCAN_API_KEY or ETHERSCAN_API_KEY env var.
# Gracefully skipped (returns None) if no key configured.

CHAIN_SOURCES: list[DataSource] = [
    DataSource(
        name="holder_concentration",
        fetcher=fetch_holder_concentration,
        columns=[
            "holder_top10_pct",
            "holder_top3_pct",
            "holder_treasury_flag",
        ],
        defaults={
            "holder_top10_pct":     0.0,
            "holder_top3_pct":      0.0,
            "holder_treasury_flag": 0.0,
        },
        scope="per_symbol",
        cache_file="src_{symbol}_holders.csv",
    ),
]


# ─── Derived helpers ──────────────────────────────────────────────────────────

def all_dex_columns() -> list[str]:
    cols: list[str] = []
    for src in DEX_SOURCES:
        cols.extend(src.columns)
    return cols


def all_chain_columns() -> list[str]:
    cols: list[str] = []
    for src in CHAIN_SOURCES:
        cols.extend(src.columns)
    return cols


def dex_defaults() -> dict[str, float]:
    d: dict[str, float] = {}
    for src in DEX_SOURCES:
        d.update(src.defaults)
    return d


def chain_defaults() -> dict[str, float]:
    d: dict[str, float] = {}
    for src in CHAIN_SOURCES:
        d.update(src.defaults)
    return d
