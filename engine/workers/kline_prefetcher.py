"""Background kline prefetcher — keeps Redis warm for the chart endpoint.

Runs on APScheduler every 5 minutes. Loads klines from the on-disk CSV
cache (offline=True — no network) and writes them to Redis. Symbols with
no local CSV are silently skipped; they'll be populated on first request.

Only runs when Redis is connected (is_connected() == True).
"""
from __future__ import annotations

import logging

from cache.kline_cache import is_connected, set_klines
from data_cache.loader import load_klines
from exceptions import CacheMiss
from universe.binance_30 import SYMBOLS as BINANCE_30

log = logging.getLogger("engine.kline_prefetcher")

# Timeframes to warm in Redis
_PREFETCH_TFS = ("1h", "4h", "1d")

# Max rows stored per symbol/tf (tail of the series)
_MAX_ROWS = 500


def _df_to_rows(df) -> list[dict]:  # type: ignore[no-untyped-def]
    """Convert a klines DataFrame to a list of JSON-serialisable dicts."""
    df = df.tail(_MAX_ROWS).copy()
    rows = []
    for ts, row in df.iterrows():
        rows.append({
            "t": int(ts.timestamp() * 1000),
            "o": float(row["open"]),
            "h": float(row["high"]),
            "l": float(row["low"]),
            "c": float(row["close"]),
            "v": float(row["volume"]),
        })
    return rows


async def prefetch_klines() -> None:
    """Load cached CSVs → Redis for all BINANCE_30 symbols × _PREFETCH_TFS.

    Called by APScheduler; skips gracefully if Redis is down.
    """
    if not is_connected():
        return

    refreshed = 0
    skipped = 0

    for symbol in BINANCE_30:
        for tf in _PREFETCH_TFS:
            try:
                df = load_klines(symbol, tf, offline=True)
                rows = _df_to_rows(df)
                await set_klines(symbol, tf, rows)
                refreshed += 1
            except CacheMiss:
                skipped += 1
            except Exception as exc:
                log.warning("prefetch error %s/%s: %s", symbol, tf, exc)
                skipped += 1

    log.info(
        "kline_prefetcher: refreshed=%d skipped=%d (no local CSV)",
        refreshed,
        skipped,
    )
