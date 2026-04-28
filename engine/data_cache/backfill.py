"""Multi-source historical data backfill.

Fetches 6+ months of OHLCV, funding, and OI from Binance Futures and
Coinalyze, stores results as CSV in data_cache/historical/.

Usage:
    python -m engine.scripts.backfill_historical --symbols BTCUSDT ETHUSDT --months 6
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

log = logging.getLogger("engine.data_cache.backfill")

_CACHE_DIR = Path(__file__).parent / "historical"
_BINANCE_FUTURES = "https://fapi.binance.com"
_UA = "cogochi-autoresearch/backfill"
_SLEEP = 0.3  # 300ms between Binance requests — well within 1200/min limit


def _cache_path(symbol: str, dtype: str) -> Path:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return _CACHE_DIR / f"{symbol}_{dtype}.csv"


def _ts(dt: datetime) -> "pd.Timestamp":
    """Ensure datetime becomes a UTC-aware pd.Timestamp for safe comparison."""
    ts = pd.Timestamp(dt)
    if ts.tzinfo is None:
        ts = ts.tz_localize("UTC")
    return ts


def _fetch_binance_json(path: str) -> list | dict:
    import json
    import urllib.request

    url = f"{_BINANCE_FUTURES}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ── OHLCV ────────────────────────────────────────────────────────────────────

def backfill_klines(
    symbol: str,
    *,
    start: datetime,
    end: datetime | None = None,
    timeframe: str = "1h",
    force: bool = False,
) -> pd.DataFrame:
    """Fetch Binance Futures klines from `start` to `end` with pagination."""
    path = _cache_path(symbol, f"klines_{timeframe}")
    if not force and path.exists():
        df = pd.read_csv(path, index_col="timestamp", parse_dates=True)
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        # If cache covers the requested range, return it
        if df.index.min() <= _ts(start):
            log.info("[%s] klines cache hit (%d rows)", symbol, len(df))
            
            return df[df.index >= _ts(start)]

    end = end or datetime.now(tz=timezone.utc)
    end_ms = int(end.timestamp() * 1000)
    start_ms = int(start.timestamp() * 1000)
    all_rows: list[list] = []

    log.info("[%s] backfilling klines %s from %s to %s", symbol, timeframe, start.date(), end.date())
    while True:
        path_q = (
            f"/fapi/v1/klines?symbol={symbol}&interval={timeframe}"
            f"&limit=1000&endTime={end_ms}"
        )
        try:
            batch = _fetch_binance_json(path_q)
        except Exception as exc:
            log.warning("[%s] klines fetch error at end_ms=%d: %s", symbol, end_ms, exc)
            break
        if not batch:
            break
        all_rows = batch + all_rows
        oldest_open = batch[0][0]
        if oldest_open <= start_ms:
            break
        end_ms = oldest_open - 1
        time.sleep(_SLEEP)

    if not all_rows:
        log.error("[%s] no klines returned", symbol)
        return pd.DataFrame()

    df = pd.DataFrame(
        all_rows,
        columns=[
            "open_time", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades",
            "taker_buy_base_vol", "taker_buy_quote_vol", "ignore",
        ],
    )
    for col in ["open", "high", "low", "close", "volume", "quote_volume"]:
        df[col] = df[col].astype(float)
    df["timestamp"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    df = df.rename(columns={"taker_buy_base_vol": "taker_buy_base_volume"})
    df = df.set_index("timestamp")[["open", "high", "low", "close", "volume", "taker_buy_base_volume"]]
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df = df[df.index >= _ts(start)]

    _write_cache(df, path)
    log.info("[%s] klines done: %d rows, %s → %s", symbol, len(df), df.index[0].date(), df.index[-1].date())
    return df


# ── Funding Rate ─────────────────────────────────────────────────────────────

def backfill_funding(
    symbol: str,
    *,
    start: datetime,
    end: datetime | None = None,
    force: bool = False,
) -> pd.DataFrame:
    """Fetch Binance funding rate history (8h interval). Goes back ~1 year."""
    path = _cache_path(symbol, "funding")
    if not force and path.exists():
        df = pd.read_csv(path, index_col="timestamp", parse_dates=True)
        if hasattr(df.index, "tz") and df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        if df.index.min() <= _ts(start):
            log.info("[%s] funding cache hit (%d rows)", symbol, len(df))
            return df[df.index >= _ts(start)]

    end = end or datetime.now(tz=timezone.utc)
    end_ms = int(end.timestamp() * 1000)
    start_ms = int(start.timestamp() * 1000)
    all_rows: list[dict] = []

    # Funding API uses startTime for forward pagination (unlike klines which uses endTime)
    current_start_ms = start_ms
    log.info("[%s] backfilling funding from %s to %s", symbol, start.date(), end.date())
    while current_start_ms < end_ms:
        path_q = f"/fapi/v1/fundingRate?symbol={symbol}&limit=1000&startTime={current_start_ms}"
        try:
            batch = _fetch_binance_json(path_q)
        except Exception as exc:
            log.warning("[%s] funding fetch error: %s", symbol, exc)
            break
        if not batch:
            break
        all_rows.extend(batch)
        newest = batch[-1]["fundingTime"]
        if newest >= end_ms:
            break
        current_start_ms = newest + 1
        time.sleep(_SLEEP)

    if not all_rows:
        return pd.DataFrame()

    df = pd.DataFrame(all_rows)
    df["timestamp"] = pd.to_datetime(df["fundingTime"], unit="ms", utc=True)
    df["funding_rate"] = df["fundingRate"].astype(float)
    df = df.set_index("timestamp")[["funding_rate"]]
    df = df[~df.index.duplicated(keep="last")].sort_index()
    df = df[df.index >= _ts(start)]

    _write_cache(df, path)
    log.info("[%s] funding done: %d rows", symbol, len(df))
    return df


# ── Coinalyze OI ─────────────────────────────────────────────────────────────

def backfill_oi_coinalyze(
    symbol: str,
    *,
    start: datetime,
    end: datetime | None = None,
    timeframe: str = "1h",
    force: bool = False,
) -> pd.DataFrame:
    """Fetch Coinalyze OI history. Falls back to Binance (30d limit) if unavailable."""
    path = _cache_path(symbol, f"oi_{timeframe}")
    if not force and path.exists():
        df = pd.read_csv(path, index_col="timestamp", parse_dates=True)
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        if df.index.min() <= _ts(start):
            log.info("[%s] OI cache hit (%d rows)", symbol, len(df))
            
            return df[df.index >= _ts(start)]

    end = end or datetime.now(tz=timezone.utc)

    # Try Coinalyze first
    try:
        from data_cache.fetch_coinalyze_oi import fetch_coinalyze_oi_history
        df = fetch_coinalyze_oi_history(symbol, start=start, end=end, timeframe=timeframe)
        if len(df) > 0:
            _write_cache(df, path)
            log.info("[%s] OI from Coinalyze: %d rows", symbol, len(df))
            return df
    except Exception as exc:
        log.warning("[%s] Coinalyze OI failed, falling back to Binance: %s", symbol, exc)

    # Fallback: Binance (30d only)
    try:
        df = _fetch_binance_oi_fallback(symbol, timeframe=timeframe)
        if len(df) > 0:
            df = df[df.index >= _ts(start)]
            _write_cache(df, path)
            log.info("[%s] OI from Binance fallback: %d rows", symbol, len(df))
            return df
    except Exception as exc:
        log.warning("[%s] Binance OI fallback failed: %s", symbol, exc)

    return pd.DataFrame()


def _fetch_binance_oi_fallback(symbol: str, timeframe: str = "1h") -> pd.DataFrame:
    """Binance OI history — max 30 days."""
    path_q = f"/futures/data/openInterestHist?symbol={symbol}&period={timeframe}&limit=500"
    data = _fetch_binance_json(path_q)
    if not data:
        return pd.DataFrame()
    df = pd.DataFrame(data)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df["oi_usd"] = df["sumOpenInterestValue"].astype(float)
    return df.set_index("timestamp")[["oi_usd"]].sort_index()


# ── Orchestrator ─────────────────────────────────────────────────────────────

def backfill_symbol(
    symbol: str,
    *,
    months: int = 6,
    timeframe: str = "1h",
    force: bool = False,
) -> dict[str, pd.DataFrame]:
    """Backfill all data types for a symbol. Returns dict of DataFrames."""
    start = datetime.now(tz=timezone.utc) - timedelta(days=30 * months)
    results: dict[str, pd.DataFrame] = {}

    results["klines"] = backfill_klines(symbol, start=start, timeframe=timeframe, force=force)
    results["funding"] = backfill_funding(symbol, start=start, force=force)
    results["oi"] = backfill_oi_coinalyze(symbol, start=start, timeframe=timeframe, force=force)

    return results


def backfill_universe(
    symbols: list[str],
    *,
    months: int = 6,
    timeframe: str = "1h",
    force: bool = False,
) -> dict[str, dict[str, pd.DataFrame]]:
    """Backfill all symbols. Returns {symbol: {dtype: df}}."""
    results = {}
    for sym in symbols:
        try:
            results[sym] = backfill_symbol(sym, months=months, timeframe=timeframe, force=force)
        except Exception as exc:
            log.error("[%s] backfill failed: %s", sym, exc)
            results[sym] = {}
    return results


def _write_cache(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path)
