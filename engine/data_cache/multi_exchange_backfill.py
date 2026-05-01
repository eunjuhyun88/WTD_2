"""Multi-exchange OHLCV backfill — W-0358.

Fetches 1h OHLCV from multiple exchanges and writes to ParquetStore
using exchange-tagged paths: ohlcv/{exchange_id}/{symbol}_{tf}.parquet

Existing canonical Binance futures files in ohlcv/*.parquet are NOT touched.

Usage:
    cd engine
    uv run python -m data_cache.multi_exchange_backfill --tier 1 --months 12
    uv run python -m data_cache.multi_exchange_backfill --tier 2 --months 6 --dry-run
    uv run python -m data_cache.multi_exchange_backfill --tier 1 --months 1 --symbols BTCUSDT ETHUSDT
"""
from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Callable

import pandas as pd

from data_cache.parquet_store import ParquetStore
from data_cache.exchanges.binance_spot_adapter import BinanceSpotAdapter
from data_cache.exchanges.ccxt_adapter import (
    CcxtAdapter,
    okx_spot,
    okx_swap,
    bybit_spot,
    bybit_linear,
    coinbase_spot,
    kraken_spot,
)
from data_cache.exchanges.base import ExchangeAdapter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Symbol lists
# ---------------------------------------------------------------------------

# Tier 1: top-20 major coins (cross-exchange basis meaningful)
TIER1_SYMBOLS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
    "DOGEUSDT", "ADAUSDT", "TRXUSDT", "AVAXUSDT", "TONUSDT",
    "SHIBUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT", "LTCUSDT",
    "BCHUSDT", "UNIUSDT", "NEARUSDT", "AAVEUSDT", "APTUSDT",
]

# ---------------------------------------------------------------------------
# Adapter registry  (exchange_id, factory_fn)
# ---------------------------------------------------------------------------

AdapterFactory = Callable[[], ExchangeAdapter]

TIER1_ADAPTERS: list[tuple[str, AdapterFactory]] = [
    ("binance_spot", BinanceSpotAdapter),
    ("okx_spot", okx_spot),
    ("okx_swap", okx_swap),
    ("bybit_spot", bybit_spot),
    ("bybit_linear", bybit_linear),
    ("coinbase_spot", coinbase_spot),
    ("kraken_spot", kraken_spot),
]

TIER2_ADAPTERS: list[tuple[str, AdapterFactory]] = [
    ("binance_spot", BinanceSpotAdapter),
    ("okx_spot", okx_spot),
    ("bybit_spot", bybit_spot),
]

# Per-exchange concurrency (number of simultaneous symbol fetches)
_CONCURRENCY: dict[str, int] = {
    "binance_spot": 8,
    "okx_spot": 6,
    "okx_swap": 6,
    "bybit_spot": 5,
    "bybit_linear": 5,
    "coinbase_spot": 2,
    "kraken_spot": 1,
}

# ---------------------------------------------------------------------------
# Storage helpers — exchange-tagged paths separate from canonical paths
# ---------------------------------------------------------------------------


def _ohlcv_path(store: ParquetStore, exchange_id: str, symbol: str, tf: str) -> Path:
    """Return exchange-tagged OHLCV path.

    Layout: ohlcv/{exchange_id}/{symbol}_{tf}.parquet
    This is completely separate from canonical Binance futures files at
    ohlcv/{symbol}_{tf}.parquet.
    """
    d = store._ohlcv / exchange_id
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{symbol}_{tf}.parquet"


def _get_last_ts_ms(store: ParquetStore, exchange_id: str, symbol: str, tf: str) -> int | None:
    """Return last timestamp in ms from exchange-tagged file, or None."""
    p = _ohlcv_path(store, exchange_id, symbol, tf)
    if not p.exists():
        return None
    try:
        df = pd.read_parquet(p, columns=["ts"])
        if df.empty:
            return None
        return int(df["ts"].max())
    except Exception:
        return None


def _upsert_exchange(
    store: ParquetStore,
    exchange_id: str,
    symbol: str,
    tf: str,
    new_df: pd.DataFrame,
) -> int:
    """Merge new_df into exchange-tagged parquet. Returns total row count."""
    if new_df.empty:
        return 0
    p = _ohlcv_path(store, exchange_id, symbol, tf)
    if p.exists():
        old = pd.read_parquet(p)
        combined = pd.concat([old, new_df], ignore_index=True)
        combined = (
            combined
            .drop_duplicates(subset=["ts"])
            .sort_values("ts")
            .reset_index(drop=True)
        )
    else:
        combined = new_df.sort_values("ts").reset_index(drop=True)
    combined.to_parquet(p, index=False, compression="zstd")
    return len(combined)


# ---------------------------------------------------------------------------
# Per-symbol fetch coroutine
# ---------------------------------------------------------------------------


async def _fetch_one_symbol(
    adapter: ExchangeAdapter,
    exchange_id: str,
    symbol: str,
    tf: str,
    start_ms: int,
    end_ms: int,
    store: ParquetStore,
    sem: asyncio.Semaphore,
    dry_run: bool,
) -> tuple[str, int]:
    """Fetch and store one symbol. Returns (symbol, rows_written)."""
    async with sem:
        last_ts = _get_last_ts_ms(store, exchange_id, symbol, tf)
        since_ms = (last_ts + 1) if last_ts is not None else start_ms

        if since_ms >= end_ms:
            log.debug("[%s/%s] already up-to-date", exchange_id, symbol)
            return symbol, 0

        if dry_run:
            since_dt = datetime.fromtimestamp(since_ms / 1000, tz=timezone.utc).date()
            log.info("[DRY] %s/%s since %s", exchange_id, symbol, since_dt)
            return symbol, 0

        # Paginated fetch
        all_frames: list[pd.DataFrame] = []
        cursor = since_ms
        limit = 500

        while cursor < end_ms:
            df = await adapter.fetch_ohlcv(symbol, tf, cursor, limit)
            if df.empty:
                break
            all_frames.append(df)
            last = int(df["ts"].max())
            if last <= cursor:
                break
            cursor = last + 1
            await asyncio.sleep(0.1)

        if not all_frames:
            return symbol, 0

        full = pd.concat(all_frames, ignore_index=True)
        full = full[full["ts"] <= end_ms]
        rows = _upsert_exchange(store, exchange_id, symbol, tf, full)
        log.info("  [%s/%s] %d rows stored", exchange_id, symbol, rows)
        return symbol, rows


# ---------------------------------------------------------------------------
# Main orchestrator
# ---------------------------------------------------------------------------


async def run_backfill(
    tier: int,
    months: int,
    tf: str,
    dry_run: bool,
    symbols: list[str] | None = None,
) -> None:
    store = ParquetStore()
    end = datetime.now(tz=timezone.utc)
    start = end - timedelta(days=30 * months)
    start_ms = int(start.timestamp() * 1000)
    end_ms = int(end.timestamp() * 1000)

    adapter_specs = TIER1_ADAPTERS if tier == 1 else TIER2_ADAPTERS

    if symbols is None:
        if tier == 1:
            symbols = TIER1_SYMBOLS
        else:
            # Tier 2: all existing Binance futures symbols (up to 100)
            symbols = store.list_symbols(tf)[:100]

    log.info(
        "Tier %d | %d symbols | %d months | %d adapters | dry=%s",
        tier, len(symbols), months, len(adapter_specs), dry_run,
    )

    for exc_id, factory in adapter_specs:
        adapter = factory()
        sem = asyncio.Semaphore(_CONCURRENCY.get(exc_id, 4))
        log.info("=== %s ===", exc_id)

        tasks = [
            _fetch_one_symbol(
                adapter, exc_id, sym, tf,
                start_ms, end_ms, store, sem, dry_run,
            )
            for sym in symbols
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        ok = sum(1 for r in results if isinstance(r, tuple) and r[1] > 0)
        skip = sum(1 for r in results if isinstance(r, tuple) and r[1] == 0)
        fail = sum(1 for r in results if isinstance(r, Exception))
        log.info(
            "%s done: %d fetched, %d skip/up-to-date, %d failed",
            exc_id, ok, skip, fail,
        )

        if hasattr(adapter, "close"):
            await adapter.close()

    log.info("Backfill complete.")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Multi-exchange OHLCV backfill (W-0358)",
    )
    parser.add_argument("--tier", type=int, default=1, choices=[1, 2])
    parser.add_argument("--months", type=int, default=12)
    parser.add_argument("--tf", default="1h")
    parser.add_argument("--symbols", nargs="*", help="Override symbol list")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    asyncio.run(
        run_backfill(
            tier=args.tier,
            months=args.months,
            tf=args.tf,
            dry_run=args.dry_run,
            symbols=args.symbols,
        )
    )
