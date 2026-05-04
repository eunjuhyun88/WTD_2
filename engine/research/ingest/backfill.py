"""Full historical backfill for Binance perp futures data.

Writes parquet files under data_cache/research/binance/{symbol}/:
    {tf}.parquet       — OHLCV klines
    oi_{period}.parquet — Open interest history
    funding.parquet    — Funding rate history

CLI usage:
    python -m engine.research.ingest.backfill --symbol BTCUSDT --tf 1h --days 30
    python -m engine.research.ingest.backfill --symbol BTCUSDT --oi-period 5m --days 7
    python -m engine.research.ingest.backfill --symbol BTCUSDT --funding --days 30
    python -m engine.research.ingest.backfill --all-symbols --tf 1h --days 30

The backfill is idempotent: re-running will upsert new data without duplicating
existing rows (deduplication by ts_ms).
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import pandas as pd

from engine.research.ingest.binance_perp import (
    days_ago_ms,
    fetch_funding_range,
    fetch_klines_range,
    fetch_oi_range,
    now_ms,
)
from engine.research.ingest.universe import ALL_SYMBOLS, OI_PERIODS, TIMEFRAMES

log = logging.getLogger("engine.research.ingest.backfill")

# Root directory for research data
_DATA_ROOT = Path(__file__).parents[3] / "data_cache" / "research" / "binance"


def symbol_dir(symbol: str) -> Path:
    d = _DATA_ROOT / symbol
    d.mkdir(parents=True, exist_ok=True)
    return d


def _upsert_parquet(path: Path, new_df: pd.DataFrame) -> pd.DataFrame:
    """Merge new_df into existing parquet, dedup by ts_ms, save. Returns merged df."""
    if new_df.empty:
        if path.exists():
            return pd.read_parquet(path)
        return new_df

    if path.exists():
        old = pd.read_parquet(path)
        merged = pd.concat([old, new_df], ignore_index=True)
    else:
        merged = new_df.copy()

    merged = (
        merged
        .drop_duplicates(subset=["ts_ms"])
        .sort_values("ts_ms")
        .reset_index(drop=True)
    )
    merged.to_parquet(path, index=False, compression="zstd")
    return merged


# ── Per-type backfill functions ────────────────────────────────────────────────


def backfill_ohlcv(symbol: str, tf: str, days: int) -> pd.DataFrame:
    """Backfill OHLCV klines for symbol/tf over the last `days` days.

    Returns the final merged DataFrame as written to disk.
    """
    path = symbol_dir(symbol) / f"{tf}.parquet"
    start_ms = days_ago_ms(days)
    end_ms = now_ms()

    log.info("[%s/%s] Fetching OHLCV %d days (start=%s)", symbol, tf, days,
             _ms_to_str(start_ms))
    df = fetch_klines_range(symbol, tf, start_ms, end_ms)
    if df.empty:
        log.warning("[%s/%s] No klines returned", symbol, tf)
        return df

    result = _upsert_parquet(path, df)
    log.info("[%s/%s] Written %d rows → %s (%.1f KB)",
             symbol, tf, len(result), path, path.stat().st_size / 1024)
    return result


def backfill_oi(symbol: str, period: str, days: int) -> pd.DataFrame:
    """Backfill open interest history."""
    path = symbol_dir(symbol) / f"oi_{period}.parquet"
    start_ms = days_ago_ms(days)
    end_ms = now_ms()

    log.info("[%s/OI-%s] Fetching %d days", symbol, period, days)
    df = fetch_oi_range(symbol, period, start_ms, end_ms)
    if df.empty:
        log.warning("[%s/OI-%s] No OI data returned", symbol, period)
        return df

    result = _upsert_parquet(path, df)
    log.info("[%s/OI-%s] Written %d rows → %s (%.1f KB)",
             symbol, period, len(result), path, path.stat().st_size / 1024)
    return result


def backfill_funding(symbol: str, days: int) -> pd.DataFrame:
    """Backfill funding rate history."""
    path = symbol_dir(symbol) / "funding.parquet"
    start_ms = days_ago_ms(days)
    end_ms = now_ms()

    log.info("[%s/FUNDING] Fetching %d days", symbol, days)
    df = fetch_funding_range(symbol, start_ms, end_ms)
    if df.empty:
        log.warning("[%s/FUNDING] No funding data returned", symbol)
        return df

    result = _upsert_parquet(path, df)
    log.info("[%s/FUNDING] Written %d rows → %s (%.1f KB)",
             symbol, len(result), path, path.stat().st_size / 1024)
    return result


# ── Verification helpers ───────────────────────────────────────────────────────


def verify_ohlcv(df: pd.DataFrame, symbol: str, tf: str, days: int) -> dict:
    """Verify OHLCV DataFrame quality. Returns dict with pass/fail info."""
    interval_ms = _tf_to_ms(tf)
    expected_rows = (days * 86_400_000) // interval_ms
    tolerance = 0.01  # 1%

    issues: list[str] = []
    result: dict = {
        "symbol": symbol,
        "tf": tf,
        "rows": len(df),
        "expected_rows": expected_rows,
    }

    if df.empty:
        issues.append("DataFrame is empty")
        result["issues"] = issues
        result["pass"] = False
        return result

    # Row count within ±1%
    if abs(len(df) - expected_rows) / expected_rows > tolerance:
        issues.append(
            f"Row count {len(df)} deviates from expected {expected_rows} by "
            f"{abs(len(df) - expected_rows) / expected_rows:.1%} (threshold {tolerance:.0%})"
        )

    # No nulls in OHLC
    for col in ["open", "high", "low", "close"]:
        null_count = df[col].isna().sum()
        if null_count > 0:
            issues.append(f"Column '{col}' has {null_count} null values")

    # ts_ms monotonic
    if not df["ts_ms"].is_monotonic_increasing:
        issues.append("ts_ms is not monotonically increasing")

    # No duplicates
    dup_count = df["ts_ms"].duplicated().sum()
    if dup_count > 0:
        issues.append(f"{dup_count} duplicate ts_ms values")

    result["issues"] = issues
    result["pass"] = len(issues) == 0
    return result


def _tf_to_ms(tf: str) -> int:
    """Convert timeframe string to milliseconds per bar."""
    table = {
        "1m": 60_000,
        "3m": 180_000,
        "5m": 300_000,
        "15m": 900_000,
        "30m": 1_800_000,
        "1h": 3_600_000,
        "2h": 7_200_000,
        "4h": 14_400_000,
        "6h": 21_600_000,
        "8h": 28_800_000,
        "12h": 43_200_000,
        "1d": 86_400_000,
        "3d": 259_200_000,
        "1w": 604_800_000,
    }
    if tf not in table:
        raise ValueError(f"Unknown timeframe: {tf}")
    return table[tf]


def _ms_to_str(ms: int) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


# ── CLI ────────────────────────────────────────────────────────────────────────


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m engine.research.ingest.backfill",
        description="Backfill Binance perp futures data to parquet",
    )
    p.add_argument("--symbol", help="Single symbol, e.g. BTCUSDT")
    p.add_argument("--all-symbols", action="store_true",
                   help="Backfill all 20 universe symbols")
    p.add_argument("--tf", help=f"Timeframe for OHLCV, one of: {TIMEFRAMES}")
    p.add_argument("--oi-period", help=f"OI period, one of: {OI_PERIODS}")
    p.add_argument("--funding", action="store_true",
                   help="Backfill funding rate")
    p.add_argument("--days", type=int, default=30,
                   help="How many days back to fetch (default: 30)")
    p.add_argument("--verify", action="store_true",
                   help="Print verification summary after backfill")
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

    symbols: list[str]
    if args.all_symbols:
        symbols = ALL_SYMBOLS
    elif args.symbol:
        symbols = [args.symbol.upper()]
    else:
        parser.print_help()
        sys.exit(1)

    if not any([args.tf, args.oi_period, args.funding]):
        print("ERROR: Specify at least one of --tf, --oi-period, --funding")
        sys.exit(1)

    for symbol in symbols:
        if args.tf:
            if args.tf not in TIMEFRAMES:
                print(f"ERROR: Unknown timeframe '{args.tf}'. Choose from: {TIMEFRAMES}")
                sys.exit(1)
            df = backfill_ohlcv(symbol, args.tf, args.days)
            if args.verify and not df.empty:
                v = verify_ohlcv(df, symbol, args.tf, args.days)
                status = "PASS" if v["pass"] else "FAIL"
                print(f"[{symbol}/{args.tf}] VERIFY {status}: rows={v['rows']}, "
                      f"expected≈{v['expected_rows']}", end="")
                if v["issues"]:
                    print(f", issues={v['issues']}")
                else:
                    print()

        if args.oi_period:
            if args.oi_period not in OI_PERIODS:
                print(f"ERROR: Unknown OI period '{args.oi_period}'. "
                      f"Choose from: {OI_PERIODS}")
                sys.exit(1)
            backfill_oi(symbol, args.oi_period, args.days)

        if args.funding:
            backfill_funding(symbol, args.days)


if __name__ == "__main__":
    main()
