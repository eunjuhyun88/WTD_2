"""CLI: backfill historical OHLCV + funding + OI for Layer P backtest.

Usage:
    cd engine
    uv run python -m scripts.backfill_historical --symbols BTCUSDT ETHUSDT --months 6
    uv run python -m scripts.backfill_historical --probe-oi BTCUSDT  # check Coinalyze OI range

Exit codes:
    0  success
    1  partial failure (some symbols failed, others ok)
    2  complete failure
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill_historical")

_DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT"]


def cmd_probe_oi(symbol: str) -> None:
    from data_cache.fetch_coinalyze_oi import probe_oi_history_range
    print(f"\n[Q1 SPIKE] Probing Coinalyze OI range for {symbol}...")
    earliest, latest = probe_oi_history_range(symbol, timeframe="1h")
    if earliest is None:
        print("  → FAILED: could not reach Coinalyze OI endpoint")
        print("  Possible causes: API key missing, endpoint changed, network error")
        sys.exit(1)
    else:
        days_available = (latest - earliest).days if latest else 0
        print(f"  → earliest: {earliest.date()}")
        print(f"  → latest:   {latest.date() if latest else 'unknown'}")
        print(f"  → coverage: ~{days_available} days ({days_available / 30:.1f} months)")


def cmd_backfill(args: argparse.Namespace) -> int:
    from data_cache.backfill import backfill_universe

    symbols = args.symbols or _DEFAULT_SYMBOLS
    months = args.months
    timeframe = args.timeframe
    force = args.force

    print(f"\n{'=' * 60}")
    print(f"Historical Backfill")
    print(f"  Symbols:   {symbols}")
    print(f"  Period:    {months} months back")
    print(f"  Timeframe: {timeframe}")
    print(f"  Force:     {force}")
    print(f"  Start:     {datetime.now(tz=timezone.utc).date()}")
    print(f"{'=' * 60}\n")

    results = backfill_universe(symbols, months=months, timeframe=timeframe, force=force)

    failed = []
    for sym, data in results.items():
        klines_ok = len(data.get("klines", [])) > 0
        funding_ok = len(data.get("funding", [])) > 0
        oi_ok = len(data.get("oi", [])) > 0
        status = "✅" if klines_ok else "❌"
        print(
            f"  {status} {sym}: "
            f"klines={len(data.get('klines', []))} rows, "
            f"funding={len(data.get('funding', []))} rows, "
            f"OI={len(data.get('oi', []))} rows"
        )
        if not klines_ok:
            failed.append(sym)

    print()
    if failed:
        print(f"⚠️  Failed: {failed}")
        return 1 if len(failed) < len(symbols) else 2
    print("✅ All symbols backfilled successfully")
    print(f"\nData saved to: engine/data_cache/historical/")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Historical data backfill for Layer P")
    sub = parser.add_subparsers(dest="cmd")

    probe = sub.add_parser("probe-oi", help="Check Coinalyze OI range (Q1 spike)")
    probe.add_argument("symbol", default="BTCUSDT", nargs="?")

    backfill = sub.add_parser("backfill", help="Backfill all data types")
    backfill.add_argument("--symbols", nargs="+", default=None)
    backfill.add_argument("--months", type=int, default=6)
    backfill.add_argument("--timeframe", default="1h")
    backfill.add_argument("--force", action="store_true")

    # Default to backfill if no subcommand
    parser.add_argument("--symbols", nargs="+", default=None)
    parser.add_argument("--months", type=int, default=6)
    parser.add_argument("--timeframe", default="1h")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--probe-oi", metavar="SYMBOL", help="Probe Coinalyze OI range")

    args = parser.parse_args()

    if hasattr(args, "probe-oi") and args.probe_oi:
        cmd_probe_oi(args.probe_oi)
        return

    if args.cmd == "probe-oi":
        cmd_probe_oi(args.symbol)
    else:
        sys.exit(cmd_backfill(args))


if __name__ == "__main__":
    main()
