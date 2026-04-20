"""Historical OKX Smart Money signal persistence layer.

Extends fetch_okx_smart_money.py with on-disk CSV caching for past signal data.
The OKX API provides up to 24 hours of historical signals. This module:

1. Fetches signals from the API (real-time feed, up to 24h history)
2. Appends new signals to per-symbol CSV files on disk
3. Loads all cached signals from disk (historical archive)

Design: One CSV per symbol (engine/data_cache/cache/okx_signals_{symbol}.csv)
Columns: timestamp, walletType, amountUsd, soldRatioPercent, triggerWalletAddress, fetch_timestamp

Files are append-only — new signals are appended to existing files without
re-fetching or deduplication (rely on API to not return duplicates within fetch window).
"""
from __future__ import annotations

import csv
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from data_cache.fetch_okx_smart_money import (
    SYMBOL_CHAIN_MAP,
    get_smart_money_signals,
)

log = logging.getLogger("engine.data_cache.okx_historical")

# Cache directory (same as klines)
CACHE_DIR = Path(__file__).parent / "cache"


def okx_signals_path(symbol: str) -> Path:
    """Return the CSV path for historical OKX signals for a symbol."""
    return CACHE_DIR / f"okx_signals_{symbol}.csv"


def save_signals_to_disk(symbol: str, signals: list[dict]) -> int:
    """Append signals to the CSV file for a symbol. Returns count appended.

    Args:
        symbol: Binance-style symbol (e.g. "FARTCOINUSDT")
        signals: List of signal dicts from OKX API

    Returns:
        Number of signals appended
    """
    if not signals:
        return 0

    path = okx_signals_path(symbol)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    fetch_ts = datetime.now(tz=timezone.utc).isoformat()

    # Prepare rows to append
    rows = []
    for sig in signals:
        row = {
            "timestamp": int(sig.get("timestamp", 0)),  # unix ms
            "walletType": sig.get("walletType", ""),
            "amountUsd": float(sig.get("amountUsd", 0)),
            "soldRatioPercent": float(sig.get("soldRatioPercent", 0)),
            "triggerWalletAddress": sig.get("triggerWalletAddress", ""),
            "fetch_timestamp": fetch_ts,  # when we fetched it
        }
        rows.append(row)

    # Append to CSV (create if missing)
    file_exists = path.exists()
    with open(path, "a", newline="") as f:
        fieldnames = [
            "timestamp",
            "walletType",
            "amountUsd",
            "soldRatioPercent",
            "triggerWalletAddress",
            "fetch_timestamp",
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)

    log.info(f"✓ Appended {len(rows)} signals to {path}")
    return len(rows)


def load_signals_from_disk(symbol: str) -> pd.DataFrame:
    """Load all cached signals for a symbol from disk.

    Args:
        symbol: Binance-style symbol

    Returns:
        DataFrame with columns [timestamp, walletType, amountUsd, ...]
        Empty DataFrame if file does not exist
    """
    path = okx_signals_path(symbol)
    if not path.exists():
        return pd.DataFrame()

    df = pd.read_csv(path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    return df


def fetch_and_cache_signals(
    symbol: str,
    wallet_types: str = "1,2,3",
    min_amount_usd: float = 1000.0,
    max_age_hours: float = 24.0,
) -> dict:
    """Fetch recent signals from OKX API and append to disk cache.

    Args:
        symbol: Binance-style symbol
        wallet_types: Comma-separated wallet type IDs (1=Smart Money, 2=KOL, 3=Whale)
        min_amount_usd: Minimum trade size in USD
        max_age_hours: Only fetch signals from last N hours

    Returns:
        {
            "symbol": str,
            "signals_fetched": int,
            "signals_appended": int,
            "cache_path": str,
            "total_cached": int,
        }
    """
    # Check if symbol is on-chain
    if symbol not in SYMBOL_CHAIN_MAP:
        return {
            "symbol": symbol,
            "signals_fetched": 0,
            "signals_appended": 0,
            "cache_path": str(okx_signals_path(symbol)),
            "total_cached": 0,
            "error": "Symbol not in SYMBOL_CHAIN_MAP (CEX-only or not tracked)",
        }

    # Fetch from API (real-time feed, up to 24h of history)
    signals = get_smart_money_signals(
        symbol,
        wallet_types=wallet_types,
        min_amount_usd=min_amount_usd,
        max_age_hours=max_age_hours,
    )

    # Append to disk
    appended = save_signals_to_disk(symbol, signals)

    # Count total cached
    df = load_signals_from_disk(symbol)
    total = len(df)

    return {
        "symbol": symbol,
        "signals_fetched": len(signals),
        "signals_appended": appended,
        "cache_path": str(okx_signals_path(symbol)),
        "total_cached": total,
    }


def summarize_cached_signals(symbol: str) -> dict:
    """Return summary stats for cached signals of a symbol."""
    df = load_signals_from_disk(symbol)
    if df.empty:
        return {
            "symbol": symbol,
            "total_signals": 0,
            "oldest_signal": None,
            "newest_signal": None,
            "cached_days": 0,
        }

    oldest = df["timestamp"].min()
    newest = df["timestamp"].max()
    days = (newest - oldest).total_seconds() / 86400

    return {
        "symbol": symbol,
        "total_signals": len(df),
        "oldest_signal": oldest.isoformat(),
        "newest_signal": newest.isoformat(),
        "cached_days": round(days, 2),
    }
