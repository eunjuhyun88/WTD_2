#!/usr/bin/env python3
"""Demo: OKX Smart Money historical signal caching (mock data).

This demonstrates the historical data persistence system with realistic mock data.
In production, fetch_and_cache_signals() calls the actual OKX API.
"""
import sys
from pathlib import Path
import time

# Add engine to path
sys.path.insert(0, str(Path(__file__).parent / "engine"))

from data_cache.fetch_okx_historical import (
    save_signals_to_disk,
    load_signals_from_disk,
    summarize_cached_signals,
)

# Mock data simulating historical OKX API responses
MOCK_SIGNALS = {
    "FARTCOINUSDT": [
        {
            "timestamp": int((time.time() - 86400 * 2) * 1000),  # 2 days ago
            "walletType": "1",  # Smart Money
            "amountUsd": "45000",
            "soldRatioPercent": "15",
            "triggerWalletAddress": "wallet_a,wallet_b,wallet_c",
        },
        {
            "timestamp": int((time.time() - 86400 * 1.5) * 1000),  # 1.5 days ago
            "walletType": "1",
            "amountUsd": "32000",
            "soldRatioPercent": "8",
            "triggerWalletAddress": "wallet_d,wallet_e",
        },
        {
            "timestamp": int((time.time() - 3600 * 18) * 1000),  # 18 hours ago
            "walletType": "3",  # Whale
            "amountUsd": "156000",
            "soldRatioPercent": "22",
            "triggerWalletAddress": "whale_1,whale_2",
        },
        {
            "timestamp": int((time.time() - 3600 * 6) * 1000),  # 6 hours ago
            "walletType": "1",
            "amountUsd": "28500",
            "soldRatioPercent": "5",
            "triggerWalletAddress": "wallet_f,wallet_g,wallet_h",
        },
    ],
    "WIFUSDT": [
        {
            "timestamp": int((time.time() - 86400) * 1000),  # 1 day ago
            "walletType": "2",  # KOL
            "amountUsd": "18000",
            "soldRatioPercent": "30",
            "triggerWalletAddress": "kol_1,kol_2",
        },
        {
            "timestamp": int((time.time() - 3600 * 12) * 1000),  # 12 hours ago
            "walletType": "1",
            "amountUsd": "67000",
            "soldRatioPercent": "3",
            "triggerWalletAddress": "wallet_x,wallet_y,wallet_z",
        },
    ],
    "PEPEUSDT": [
        {
            "timestamp": int((time.time() - 3600 * 20) * 1000),  # 20 hours ago
            "walletType": "3",
            "amountUsd": "89000",
            "soldRatioPercent": "18",
            "triggerWalletAddress": "whale_alpha",
        },
        {
            "timestamp": int((time.time() - 3600 * 4) * 1000),  # 4 hours ago
            "walletType": "1",
            "amountUsd": "23500",
            "soldRatioPercent": "10",
            "triggerWalletAddress": "wallet_smart_1,wallet_smart_2",
        },
    ],
}


def main():
    print("\n" + "=" * 70)
    print("OKX Smart Money Historical Signal Caching Demo (Mock Data)")
    print("=" * 70)

    print("\n[1] Simulating API fetches and historical data persistence...")
    print("-" * 70)

    total_appended = 0
    for symbol, signals in MOCK_SIGNALS.items():
        appended = save_signals_to_disk(symbol, signals)
        total_appended += appended
        print(f"✓ {symbol:15} | Cached {appended:2d} signals")

    print(f"\nTotal signals cached: {total_appended}")

    print("\n[2] Historical data summary (persistent storage)...")
    print("-" * 70)

    for symbol in sorted(MOCK_SIGNALS.keys()):
        summary = summarize_cached_signals(symbol)
        if summary["total_signals"] > 0:
            print(
                f"{symbol:15} | {summary['total_signals']:2d} signals "
                f"| {summary['cached_days']:5.2f}d span "
                f"| {summary['oldest_signal'][:13]} → {summary['newest_signal'][:13]}"
            )

    print("\n[3] Detailed analysis: FARTCOINUSDT...")
    print("-" * 70)

    df = load_signals_from_disk("FARTCOINUSDT")
    if not df.empty:
        print(f"Total cached signals: {len(df)}")
        print("\nAll signals (newest first):")
        for idx, row in df.iloc[::-1].iterrows():
            wallet_map = {1: "SmartMoney", 2: "KOL", 3: "Whale"}
            wallet_name = wallet_map.get(row["walletType"], f"Type{row['walletType']}")
            ts = row["timestamp"].strftime("%Y-%m-%d %H:%M")
            print(
                f"  {ts} | {wallet_name:10} | ${row['amountUsd']:>10,.0f} | "
                f"{row['soldRatioPercent']:>5.0f}% sold | wallets={row['triggerWalletAddress']}"
            )

        print("\nAggregation by wallet type:")
        wallet_types_map = {1: "Smart Money", 2: "KOL", 3: "Whale"}
        for wtype in [1, 2, 3]:
            subset = df[df["walletType"] == wtype]
            if len(subset) > 0:
                total_usd = subset["amountUsd"].sum()
                avg_sold = subset["soldRatioPercent"].mean()
                print(
                    f"  {wallet_types_map[wtype]:15} | {len(subset):2d} signals "
                    f"| ${total_usd:12,.0f} volume | {avg_sold:5.1f}% avg sold"
                )

    print("\n[4] Real-world usage: When would these signals fire?...")
    print("-" * 70)

    print("""
Historical signals allow:
  ✓ Backtesting: "Did smart money accumulation precede price moves?"
  ✓ Pattern correlation: "When do whales buy, do patterns emerge 4h later?"
  ✓ Trend validation: "Is smart money still accumulating, or dumping?"
  ✓ Signal quality: "What % of smart money accumulation → profitable trades?"

Example workflow:
  1. fetch_and_cache_signals("FARTCOINUSDT")  # Fetch latest 24h from API
  2. load_signals_from_disk("FARTCOINUSDT")   # Load accumulated historical data
  3. Correlate signal timestamps with pattern phase entries
  4. Measure P&L on patterns where smart_money_accumulation confirmed
    """)

    print("=" * 70)
    print("Demo complete. Signals saved to engine/data_cache/cache/okx_signals_*.csv")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
