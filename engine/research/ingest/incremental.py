"""Append-only incremental updater for Binance perp futures data.

Reads the last timestamp from each parquet file and fetches only new data
since that point. Safe to call repeatedly (idempotent — deduplicates by ts_ms).

Designed for cron use:
    # Update all TIER1 symbols every 5m (1h bars)
    */5 * * * * python -m engine.research.ingest.incremental --tf 1h --tier 1

    # Update OI hourly
    0 * * * * python -m engine.research.ingest.incremental --oi-period 1h

    # Update funding every 8h
    0 */8 * * * python -m engine.research.ingest.incremental --funding

CLI:
    python -m engine.research.ingest.incremental --symbol BTCUSDT --tf 1h
    python -m engine.research.ingest.incremental --all-symbols --tf 1h
    python -m engine.research.ingest.incremental --tier 1 --tf 1h --oi-period 5m --funding
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd

from engine.research.ingest.backfill import (
    _DATA_ROOT,
    _upsert_parquet,
    symbol_dir,
)
from engine.research.ingest.binance_perp import (
    fetch_funding_range,
    fetch_klines_range,
    fetch_oi_range,
    now_ms,
)
from engine.research.ingest.universe import (
    ALL_SYMBOLS,
    OI_PERIODS,
    TIER1,
    TIER2,
    TIER3,
    TIMEFRAMES,
)

log = logging.getLogger("engine.research.ingest.incremental")

# Minimum lookback when no existing data — fallback to 7 days
_DEFAULT_LOOKBACK_MS = 7 * 86_400_000


def _last_ts_ms(path: Path) -> int | None:
    """Return the maximum ts_ms from a parquet file, or None if not found."""
    if not path.exists():
        return None
    try:
        df = pd.read_parquet(path, columns=["ts_ms"])
        if df.empty:
            return None
        return int(df["ts_ms"].max())
    except Exception as exc:
        log.warning("Could not read last ts from %s: %s", path, exc)
        return None


def incremental_ohlcv(symbol: str, tf: str) -> pd.DataFrame:
    """Fetch and append new OHLCV bars since last stored timestamp."""
    path = symbol_dir(symbol) / f"{tf}.parquet"
    last_ts = _last_ts_ms(path)

    if last_ts is None:
        start_ms = now_ms() - _DEFAULT_LOOKBACK_MS
        log.info("[%s/%s] No existing data; fetching last 7 days", symbol, tf)
    else:
        start_ms = last_ts + 1
        log.info("[%s/%s] Incremental from last ts=%d", symbol, tf, last_ts)

    end_ms = now_ms()
    if start_ms >= end_ms:
        log.debug("[%s/%s] Already up to date", symbol, tf)
        return pd.DataFrame()

    df = fetch_klines_range(symbol, tf, start_ms, end_ms)
    if df.empty:
        log.info("[%s/%s] No new data", symbol, tf)
        return df

    result = _upsert_parquet(path, df)
    log.info("[%s/%s] +%d new rows → total %d (%.1f KB)",
             symbol, tf, len(df), len(result), path.stat().st_size / 1024)
    return df


def incremental_oi(symbol: str, period: str) -> pd.DataFrame:
    """Fetch and append new OI data since last stored timestamp."""
    path = symbol_dir(symbol) / f"oi_{period}.parquet"
    last_ts = _last_ts_ms(path)

    if last_ts is None:
        start_ms = now_ms() - _DEFAULT_LOOKBACK_MS
        log.info("[%s/OI-%s] No existing data; fetching last 7 days", symbol, period)
    else:
        start_ms = last_ts + 1
        log.info("[%s/OI-%s] Incremental from last ts=%d", symbol, period, last_ts)

    end_ms = now_ms()
    if start_ms >= end_ms:
        log.debug("[%s/OI-%s] Already up to date", symbol, period)
        return pd.DataFrame()

    df = fetch_oi_range(symbol, period, start_ms, end_ms)
    if df.empty:
        log.info("[%s/OI-%s] No new data", symbol, period)
        return df

    result = _upsert_parquet(path, df)
    log.info("[%s/OI-%s] +%d new rows → total %d (%.1f KB)",
             symbol, period, len(df), len(result), path.stat().st_size / 1024)
    return df


def incremental_funding(symbol: str) -> pd.DataFrame:
    """Fetch and append new funding rate data since last stored timestamp."""
    path = symbol_dir(symbol) / "funding.parquet"
    last_ts = _last_ts_ms(path)

    if last_ts is None:
        start_ms = now_ms() - _DEFAULT_LOOKBACK_MS
        log.info("[%s/FUNDING] No existing data; fetching last 7 days", symbol)
    else:
        start_ms = last_ts + 1
        log.info("[%s/FUNDING] Incremental from last ts=%d", symbol, last_ts)

    end_ms = now_ms()
    if start_ms >= end_ms:
        log.debug("[%s/FUNDING] Already up to date", symbol)
        return pd.DataFrame()

    df = fetch_funding_range(symbol, start_ms, end_ms)
    if df.empty:
        log.info("[%s/FUNDING] No new data", symbol)
        return df

    result = _upsert_parquet(path, df)
    log.info("[%s/FUNDING] +%d new rows → total %d (%.1f KB)",
             symbol, len(df), len(result), path.stat().st_size / 1024)
    return df


# ── CLI ────────────────────────────────────────────────────────────────────────


def _tier_symbols(tier: str) -> list[str]:
    tiers = {"1": TIER1, "2": TIER2, "3": TIER3, "all": ALL_SYMBOLS}
    if tier not in tiers:
        raise ValueError(f"Invalid tier: {tier}. Choose from: 1, 2, 3, all")
    return tiers[tier]


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m engine.research.ingest.incremental",
        description="Incremental update of Binance perp futures data",
    )
    group = p.add_mutually_exclusive_group()
    group.add_argument("--symbol", help="Single symbol, e.g. BTCUSDT")
    group.add_argument("--all-symbols", action="store_true",
                       help="Update all 20 universe symbols")
    group.add_argument("--tier", choices=["1", "2", "3", "all"],
                       help="Update symbols from a specific tier")

    p.add_argument("--tf", help=f"OHLCV timeframe, one of: {TIMEFRAMES}")
    p.add_argument("--oi-period", help=f"OI period, one of: {OI_PERIODS}")
    p.add_argument("--funding", action="store_true",
                   help="Update funding rate")
    p.add_argument("--log-level", default="INFO",
                   choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    return p


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    # Determine symbol list
    if args.all_symbols:
        symbols = ALL_SYMBOLS
    elif args.tier:
        symbols = _tier_symbols(args.tier)
    elif args.symbol:
        symbols = [args.symbol.upper()]
    else:
        # Default: all symbols
        symbols = ALL_SYMBOLS

    if not any([args.tf, args.oi_period, args.funding]):
        print("ERROR: Specify at least one of --tf, --oi-period, --funding")
        sys.exit(1)

    for symbol in symbols:
        if args.tf:
            if args.tf not in TIMEFRAMES:
                print(f"ERROR: Unknown timeframe '{args.tf}'")
                sys.exit(1)
            incremental_ohlcv(symbol, args.tf)

        if args.oi_period:
            if args.oi_period not in OI_PERIODS:
                print(f"ERROR: Unknown OI period '{args.oi_period}'")
                sys.exit(1)
            incremental_oi(symbol, args.oi_period)

        if args.funding:
            incremental_funding(symbol)


if __name__ == "__main__":
    main()
