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
from data_cache.fetch_onchain import (
    fetch_active_addresses,
    fetch_tx_count,
)


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
    # ── Add new global sources here ──────────────────────────────────────────
    # Example:
    # DataSource(
    #     name="polymarket_crypto",
    #     fetcher=fetch_polymarket_crypto_sentiment,
    #     columns=["poly_bull_prob"],
    #     defaults={"poly_bull_prob": 0.5},
    #     scope="global",
    #     cache_file="src_polymarket.csv",
    # ),
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
    # ── Add new per-symbol sources here ──────────────────────────────────────
    # Example:
    # DataSource(
    #     name="exchange_netflow",
    #     fetcher=fetch_cryptoquant_netflow,
    #     columns=["netflow_usd", "netflow_norm"],
    #     defaults={"netflow_usd": 0.0, "netflow_norm": 0.5},
    #     scope="per_symbol",
    #     cache_file="src_{symbol}_netflow.csv",
    # ),
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
