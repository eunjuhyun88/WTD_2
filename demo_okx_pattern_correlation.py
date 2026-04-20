#!/usr/bin/env python3
"""Demo: Correlate historical OKX signals with pattern entries.

Shows how the historical OKX data cache integrates with the pattern engine
for validation & backtesting.
"""
import sys
from pathlib import Path

# Add engine to path
sys.path.insert(0, str(Path(__file__).parent / "engine"))

from data_cache.fetch_okx_historical import load_signals_from_disk


def analyze_smart_money_window(symbol: str, lookback_hours: float = 24) -> dict:
    """Analyze smart money activity in the lookback window.

    This would be called at pattern entry time to validate that the
    market context supports the entry.
    """
    import pandas as pd
    from datetime import timedelta

    df = load_signals_from_disk(symbol)
    if df.empty:
        return {"symbol": symbol, "smart_money_signals": 0}

    # Filter to recent window
    cutoff = pd.Timestamp.now(tz="UTC") - timedelta(hours=lookback_hours)
    recent = df[df["timestamp"] >= cutoff]

    if recent.empty:
        return {"symbol": symbol, "smart_money_signals": 0}

    # Aggregate by wallet type
    smart_money_count = len(recent[recent["walletType"] == 1])
    whale_count = len(recent[recent["walletType"] == 3])
    smart_money_vol = recent[recent["walletType"] == 1]["amountUsd"].sum()
    whale_vol = recent[recent["walletType"] == 3]["amountUsd"].sum()

    # Determine trend (buying vs selling)
    sm_avg_sold = recent[recent["walletType"] == 1]["soldRatioPercent"].mean()
    is_accumulating = sm_avg_sold < 0.5  # If < 50% sold, they're buying

    return {
        "symbol": symbol,
        "lookback_hours": lookback_hours,
        "smart_money_signals": smart_money_count,
        "whale_signals": whale_count,
        "smart_money_volume_usd": smart_money_vol,
        "whale_volume_usd": whale_vol,
        "smart_money_avg_sold_pct": round(sm_avg_sold, 1),
        "is_accumulating": is_accumulating,
    }


def main():
    print("\n" + "=" * 70)
    print("Pattern-OKX Smart Money Correlation Analysis")
    print("=" * 70)

    symbols = ["FARTCOINUSDT", "WIFUSDT", "PEPEUSDT"]

    print("\n[Scenario: Pattern entry signal detected on FARTCOINUSDT]")
    print("-" * 70)

    for symbol in symbols:
        analysis = analyze_smart_money_window(symbol, lookback_hours=24)
        print(f"\n{symbol}")
        if analysis.get("smart_money_signals", 0) == 0:
            print("  ○ No smart money activity in past 24h")
        else:
            print(f"  ✓ Smart Money signals:  {analysis['smart_money_signals']}")
            print(f"  ✓ Whale signals:        {analysis['whale_signals']}")
            print(
                f"  ✓ Smart Money volume:   ${analysis['smart_money_volume_usd']:,.0f}"
            )
            print(f"  ✓ Whale volume:         ${analysis['whale_volume_usd']:,.0f}")
            print(
                f"  ✓ Smart Money avg sold: {analysis['smart_money_avg_sold_pct']}%"
            )
            if analysis["is_accumulating"]:
                print("  → Market context: BULLISH (smart money accumulating)")
            else:
                print("  → Market context: BEARISH (smart money distributing)")

    print("\n[Pattern Entry Gate Logic]")
    print("-" * 70)
    print("""
Pseudocode for smart_money_accumulation block:

def smart_money_accumulation(ctx, min_buy_wallets=2):
    # Get last 24h of OKX signals (from historical cache)
    signals = load_signals_from_disk(ctx.symbol)
    recent = filter_by_age(signals, hours=24)

    # Calculate score
    score = compute_smart_money_score(recent)

    # Gate: at least 2 distinct buying wallets AND net buying
    returns score["buy_wallet_count"] >= min_buy_wallets \\
        and score["accumulating"]

This block can now use 24+ hours of historical data instead of just
live API calls, improving pattern confirmation reliability.
    """)

    print("\n[Integration Points]")
    print("-" * 70)
    print("""
1. Building Block: smart_money_accumulation()
   → Calls load_signals_from_disk() to get full history
   → Combines with compute_smart_money_score() for aggregation

2. Pattern Object (institutional-distribution-v1, radar-golden-entry-v1, etc.)
   → Uses smart_money_accumulation as required_block or soft_block
   → Improves signal quality by requiring historical context

3. Backtesting & Walk-Forward Validation
   → Historical cache allows offline pattern evaluation
   → No live API calls needed during backtesting loop

4. Live Monitoring
   → fetch_and_cache_signals() runs every 6h to update cache
   → Patterns automatically benefit from fresher context data
    """)

    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
