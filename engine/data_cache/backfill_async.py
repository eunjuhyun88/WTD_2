"""Async parallel OHLCV + derivatives backfiller for 1000+ symbols.

Uses asyncio with a Semaphore-based rate limiter.

Binance rate limits (IP-level):
  Futures: 2400 requests/min
  Spot:    1200 requests/min
  With workers=40 and 50ms sleep between requests per worker:
    ~800 req/min burst → well within limits

Usage:
    from data_cache.backfill_async import BackfillPipeline
    pipeline = BackfillPipeline()
    await pipeline.run_ohlcv(symbols, months=12)
    await pipeline.run_derivatives(futures_symbols, months=6)
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import httpx
import pandas as pd

from data_cache.parquet_store import ParquetStore

log = logging.getLogger("engine.backfill_async")

_BINANCE_FAPI = "https://fapi.binance.com"
_BINANCE_SPOT = "https://api.binance.com"
_UA = "cogochi-pipeline/backfill"
_PROGRESS_PATH = Path(__file__).parent / "market_data" / ".progress.json"

# Binance klines max rows per request
_KLINES_LIMIT = 1000
# Sleep between batches per worker (ms) — controls burst rate
_SLEEP_MS = 50


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def _ts(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


class BackfillPipeline:
    """Manages parallel backfill of OHLCV + derivatives data."""

    def __init__(
        self,
        store: ParquetStore | None = None,
        workers: int = 40,
        timeout_s: int = 30,
    ) -> None:
        self.store = store or ParquetStore()
        self.workers = workers
        self._sem = asyncio.Semaphore(workers)
        self._client: httpx.AsyncClient | None = None
        self._progress: dict[str, str] = self._load_progress()

    # ── Progress tracking ─────────────────────────────────────────────────────

    def _load_progress(self) -> dict[str, str]:
        if _PROGRESS_PATH.exists():
            try:
                return json.loads(_PROGRESS_PATH.read_text())
            except Exception:
                pass
        return {}

    def _save_progress(self) -> None:
        _PROGRESS_PATH.parent.mkdir(parents=True, exist_ok=True)
        _PROGRESS_PATH.write_text(json.dumps(self._progress, indent=2))

    def _mark_done(self, key: str) -> None:
        self._progress[key] = datetime.now(timezone.utc).isoformat()
        self._save_progress()

    def _is_done(self, key: str, max_age_h: float = 23) -> bool:
        ts_str = self._progress.get(key)
        if not ts_str:
            return False
        ts = datetime.fromisoformat(ts_str)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ts).total_seconds() < max_age_h * 3600

    # ── HTTP helpers ──────────────────────────────────────────────────────────

    async def _get_json(self, url: str, params: dict) -> list | dict:
        assert self._client is not None
        async with self._sem:
            await asyncio.sleep(_SLEEP_MS / 1000)
            r = await self._client.get(url, params=params, timeout=30)
            r.raise_for_status()
            return r.json()

    # ── OHLCV fetch ───────────────────────────────────────────────────────────

    async def _fetch_klines(
        self,
        symbol: str,
        exchange: Literal["futures", "spot"],
        start: datetime,
        end: datetime,
        tf: str,
    ) -> pd.DataFrame:
        """Paginate klines from start to end. Returns raw DataFrame."""
        base_url = (
            f"{_BINANCE_FAPI}/fapi/v1/klines"
            if exchange == "futures"
            else f"{_BINANCE_SPOT}/api/v3/klines"
        )
        end_ms = _ms(end)
        start_ms = _ms(start)
        all_rows: list[list] = []

        while True:
            try:
                batch = await self._get_json(base_url, {
                    "symbol": symbol,
                    "interval": tf,
                    "limit": _KLINES_LIMIT,
                    "endTime": end_ms,
                })
            except Exception as exc:
                log.warning("[%s] klines error at %d: %s", symbol, end_ms, exc)
                break
            if not batch:
                break
            all_rows = list(batch) + all_rows
            oldest = batch[0][0]
            if oldest <= start_ms:
                break
            end_ms = oldest - 1

        if not all_rows:
            return pd.DataFrame()

        df = pd.DataFrame(all_rows, columns=[
            "open_time", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades",
            "taker_buy_base_vol", "taker_buy_quote_vol", "ignore",
        ])
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)
        df["taker_buy_vol"] = df["taker_buy_base_vol"].astype(float)
        df["ts"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
        return df[["ts", "open", "high", "low", "close", "volume", "taker_buy_vol"]]

    async def _backfill_one_ohlcv(
        self,
        symbol: str,
        exchange: Literal["futures", "spot"],
        start: datetime,
        end: datetime,
        tf: str,
        force: bool,
    ) -> bool:
        key = f"ohlcv:{symbol}:{tf}"
        if not force and self._is_done(key):
            log.debug("[%s] ohlcv skip (done today)", symbol)
            return True

        # Incremental: if we have data, only fetch from last_ts onwards
        if not force and self.store.has_ohlcv(symbol, tf):
            last = self.store.get_last_ts(symbol, tf)
            if last is not None and last > start:
                start = last - timedelta(hours=2)  # 2h overlap for safety

        try:
            df = await self._fetch_klines(symbol, exchange, start, end, tf)
            if df.empty:
                log.warning("[%s] no klines returned", symbol)
                return False
            self.store.write_ohlcv(symbol, df, tf)
            self._mark_done(key)
            log.info("[%s/%s] %d rows, %s→%s", symbol, tf, len(df),
                     df["ts"].min().date(), df["ts"].max().date())
            return True
        except Exception as exc:
            log.error("[%s] ohlcv backfill failed: %s", symbol, exc)
            return False

    # ── Derivatives fetch ─────────────────────────────────────────────────────

    async def _fetch_funding(
        self, symbol: str, start: datetime, end: datetime
    ) -> pd.DataFrame:
        url = f"{_BINANCE_FAPI}/fapi/v1/fundingRate"
        start_ms = _ms(start)
        end_ms = _ms(end)
        all_rows: list[dict] = []
        cur = start_ms

        while cur < end_ms:
            try:
                batch = await self._get_json(url, {
                    "symbol": symbol, "limit": 1000, "startTime": cur
                })
            except Exception as exc:
                log.warning("[%s] funding error: %s", symbol, exc)
                break
            if not batch:
                break
            all_rows.extend(batch)
            newest = batch[-1]["fundingTime"]
            if newest >= end_ms:
                break
            cur = newest + 1

        if not all_rows:
            return pd.DataFrame()
        df = pd.DataFrame(all_rows)
        df["ts"] = pd.to_datetime(df["fundingTime"], unit="ms", utc=True)
        df["funding_rate"] = df["fundingRate"].astype(float)
        return df[["ts", "funding_rate"]]

    async def _fetch_oi(self, symbol: str, tf: str = "1h") -> pd.DataFrame:
        url = f"{_BINANCE_FAPI}/futures/data/openInterestHist"
        try:
            data = await self._get_json(url, {
                "symbol": symbol, "period": tf, "limit": 500
            })
        except Exception as exc:
            log.warning("[%s] OI error: %s", symbol, exc)
            return pd.DataFrame()
        if not data:
            return pd.DataFrame()
        df = pd.DataFrame(data)
        df["ts"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df["oi_usd"] = df["sumOpenInterestValue"].astype(float)
        return df[["ts", "oi_usd"]]

    async def _fetch_longshort(self, symbol: str, tf: str = "1h") -> pd.DataFrame:
        url = f"{_BINANCE_FAPI}/futures/data/globalLongShortAccountRatio"
        try:
            data = await self._get_json(url, {
                "symbol": symbol, "period": tf, "limit": 500
            })
        except Exception as exc:
            log.warning("[%s] L/S error: %s", symbol, exc)
            return pd.DataFrame()
        if not data:
            return pd.DataFrame()
        df = pd.DataFrame(data)
        df["ts"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df["long_ratio"] = df["longAccount"].astype(float)
        df["short_ratio"] = df["shortAccount"].astype(float)
        return df[["ts", "long_ratio", "short_ratio"]]

    async def _backfill_one_derivatives(
        self, symbol: str, start: datetime, end: datetime
    ) -> None:
        key = f"deriv:{symbol}"
        if self._is_done(key):
            return

        funding = await self._fetch_funding(symbol, start, end)
        oi = await self._fetch_oi(symbol)
        ls = await self._fetch_longshort(symbol)

        if not funding.empty:
            self.store.write_funding(symbol, funding)
        if not oi.empty:
            self.store.write_oi(symbol, oi)
        if not ls.empty:
            self.store.write_longshort(symbol, ls)

        self._mark_done(key)
        log.info("[%s] derivatives done (funding=%d oi=%d ls=%d)",
                 symbol, len(funding), len(oi), len(ls))

    # ── Public runners ────────────────────────────────────────────────────────

    async def run_ohlcv(
        self,
        universe: pd.DataFrame,
        months: int = 12,
        tf: str = "1h",
        force: bool = False,
    ) -> dict[str, int]:
        """Backfill OHLCV for all symbols in universe DataFrame.

        universe must have columns: symbol, exchange (binance_futures | binance_spot)

        Returns: {symbol: rows_written}
        """
        end = datetime.now(tz=timezone.utc)
        start = end - timedelta(days=30 * months)

        async with httpx.AsyncClient(headers={"User-Agent": _UA}, http2=True) as client:
            self._client = client
            tasks = []
            for _, row in universe.iterrows():
                sym = row["symbol"]
                exc = "futures" if row.get("has_perp") else "spot"
                tasks.append(
                    self._backfill_one_ohlcv(sym, exc, start, end, tf, force)
                )

            results = await asyncio.gather(*tasks, return_exceptions=True)

        ok = sum(1 for r in results if r is True)
        fail = sum(1 for r in results if r is not True)
        log.info("OHLCV backfill complete: %d ok, %d failed", ok, fail)
        return {"ok": ok, "failed": fail}

    async def run_derivatives(
        self,
        futures_symbols: list[str] | pd.Series,
        months: int = 6,
    ) -> dict[str, int]:
        """Backfill funding + OI + L/S for Futures symbols."""
        end = datetime.now(tz=timezone.utc)
        start = end - timedelta(days=30 * months)

        async with httpx.AsyncClient(headers={"User-Agent": _UA}, http2=True) as client:
            self._client = client
            tasks = [
                self._backfill_one_derivatives(sym, start, end)
                for sym in futures_symbols
            ]
            await asyncio.gather(*tasks, return_exceptions=True)

        log.info("Derivatives backfill complete for %d symbols", len(list(futures_symbols)))
        return {"symbols": len(list(futures_symbols))}

    async def run_incremental(
        self, universe: pd.DataFrame, tf: str = "1h"
    ) -> dict[str, int]:
        """Fetch only data since last stored timestamp (daily incremental update)."""
        return await self.run_ohlcv(universe, months=1, tf=tf, force=False)
