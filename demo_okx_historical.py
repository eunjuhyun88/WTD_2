#!/usr/bin/env python3
"""Demo: Fetch and cache historical OKX Smart Money signals.

Usage:
    python demo_okx_historical.py
"""
import sys
from pathlib import Path

# Add engine to path
sys.path.insert(0, str(Path(__file__).parent / "engine"))

from data_cache.fetch_okx_historical import (
    fetch_and_cache_signals,
    load_signals_from_disk,
    summarize_cached_signals,
)

# On-chain symbols tracked in SYMBOL_CHAIN_MAP
SYMBOLS_TO_TRACK = [
    "FARTCOINUSDT",
    "WIFUSDT",
    "BONKUSDT",
    "PEPEUSDT",
    "TRUMPUSDT",
    "POPCATUSDT",
]


def main():
    print("\n" + "=" * 70)
    print("OKX Smart Money Historical Signal Fetcher")
    print("=" * 70)

    print("\n[1] Fetching recent signals from OKX API (24h rolling window)...")
    print("-" * 70)

    results = []
    for symbol in SYMBOLS_TO_TRACK:
        result = fetch_and_cache_signals(
            symbol,
            wallet_types="1,2,3",  # Smart Money, KOL, Whale
            min_amount_usd=1000.0,
            max_age_hours=24.0,
        )
        results.append(result)

        status = "✓" if result.get("signals_fetched", 0) > 0 else "○"
        error = result.get("error")
        if error:
            print(
                f"{status} {symbol:15} | Error: {error}"
            )
        else:
            print(
                f"{status} {symbol:15} | Fetched: {result['signals_fetched']:3d} "
                f"| Cached: {result['total_cached']:5d} total"
            )

    print("\n[2] Summary of cached historical data...")
    print("-" * 70)

    for symbol in SYMBOLS_TO_TRACK:
        summary = summarize_cached_signals(symbol)
        if summary["total_signals"] > 0:
            print(
                f"{symbol:15} | {summary['total_signals']:6d} signals "
                f"| {summary['cached_days']:5.1f} days cached "
                f"| {summary['oldest_signal'][:10]}...{summary['newest_signal'][-8:]}"
            )
        else:
            print(f"{symbol:15} | (no cached data)")

    print("\n[3] Example: Load and inspect FARTCOINUSDT signals...")
    print("-" * 70)

    df = load_signals_from_disk("FARTCOINUSDT")
    if not df.empty:
        print(f"Total rows: {len(df)}")
        print("\nFirst 5 signals:")
        print(df[["timestamp", "walletType", "amountUsd", "soldRatioPercent"]].head())
        print("\nLast 5 signals:")
        print(df[["timestamp", "walletType", "amountUsd", "soldRatioPercent"]].tail())

        # Aggregate by wallet type
        print("\nSignals by wallet type:")
        wallet_types = {1: "Smart Money", 2: "KOL", 3: "Whale"}
        for wtype in [1, 2, 3]:
            count = len(df[df["walletType"] == wtype])
            if count > 0:
                subset = df[df["walletType"] == wtype]
                total_usd = subset["amountUsd"].sum()
                print(f"  {wallet_types[wtype]:15} | {count:4d} signals | ${total_usd:12,.0f} volume")
    else:
        print("(no cached data for FARTCOINUSDT)")

    print("\n" + "=" * 70)
    print("Demo complete. Historical signals saved to engine/data_cache/cache/")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
