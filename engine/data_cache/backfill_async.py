"""Async parallel OHLCV + derivatives backfiller for 1000+ symbols.

Uses asyncio with a token-bucket global rate limiter.

Binance rate limits (IP-level):
  Futures: 2400 req/min = 40 req/s
  Spot:    1200 req/min = 20 req/s
  Safe target: 20 req/s (50% headroom)
  workers=8, global token bucket 20/s = ~1200 req/min

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
_BYBIT_BASE = "https://api.bybit.com"
_UA = "cogochi-pipeline/backfill"
_PROGRESS_PATH = Path(__file__).parent / "market_data" / ".progress.json"

# Binance klines max rows per request
_KLINES_LIMIT = 1000
# Global rate limit: max requests per second across all workers
_RATE_LIMIT_RPS = 10  # conservative: 10 req/s = 600/min (25% of Binance 2400/min limit)
_MIN_SLEEP_S = 0.05   # minimum sleep even when bucket has tokens


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def _ts(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)


class _TokenBucket:
    """Token bucket for global rate limiting across all coroutines."""

    def __init__(self, rate_per_sec: float) -> None:
        self._rate = rate_per_sec
        self._tokens = rate_per_sec
        self._last = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last
            self._last = now
            self._tokens = min(self._rate, self._tokens + elapsed * self._rate)
            if self._tokens < 1:
                wait = (1 - self._tokens) / self._rate
                self._tokens = 0
            else:
                self._tokens -= 1
                wait = 0.0
        if wait > 0:
            await asyncio.sleep(wait)
        await asyncio.sleep(_MIN_SLEEP_S)


class BackfillPipeline:
    """Manages parallel backfill of OHLCV + derivatives data."""

    def __init__(
        self,
        store: ParquetStore | None = None,
        workers: int = 4,
        rate_per_sec: float = _RATE_LIMIT_RPS,
    ) -> None:
        self.store = store or ParquetStore()
        self.workers = workers
        self._sem = asyncio.Semaphore(workers)
        self._bucket: _TokenBucket | None = None
        self._rate = rate_per_sec
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

    async def _get_json(self, url: str, params: dict, retries: int = 6) -> list | dict:
        assert self._client is not None and self._bucket is not None
        for attempt in range(retries):
            await self._bucket.acquire()
            async with self._sem:
                try:
                    r = await self._client.get(url, params=params, timeout=30)
                    if r.status_code in (418, 429):
                        wait = 60 * (attempt + 1)
                        log.warning("Binance rate limit (%d), sleeping %ds", r.status_code, wait)
                        await asyncio.sleep(wait)
                        continue
                    r.raise_for_status()
                    return r.json()
                except httpx.HTTPStatusError:
                    raise
                except Exception as exc:
                    if attempt == retries - 1:
                        raise
                    await asyncio.sleep(2 ** attempt)
        raise RuntimeError(f"Failed after {retries} retries")

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

        consecutive_errors = 0
        while True:
            try:
                batch = await self._get_json(base_url, {
                    "symbol": symbol,
                    "interval": tf,
                    "limit": _KLINES_LIMIT,
                    "endTime": end_ms,
                })
                consecutive_errors = 0
            except Exception as exc:
                consecutive_errors += 1
                if consecutive_errors >= 5:
                    log.warning("[%s] klines giving up after %d errors: %s", symbol, consecutive_errors, exc)
                    break
                wait = min(60 * consecutive_errors, 300)
                log.warning("[%s] klines page error (%d), retry in %ds: %s", symbol, consecutive_errors, wait, exc)
                await asyncio.sleep(wait)
                continue
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

    @staticmethod
    def _bybit_symbol(binance_symbol: str) -> str:
        """Map Binance perp symbol → Bybit linear symbol.

        Binance uses multiplier prefixes for micro-cap tokens (1000PEPEUSDT).
        Bybit uses the full token name without the 1000x multiplier.
        """
        import re
        return re.sub(r"^1000+", "", binance_symbol)

    async def _fetch_oi_bybit(
        self, symbol: str, start: datetime, end: datetime, tf: str = "1h"
    ) -> pd.DataFrame:
        """Fetch historical OI from Bybit (supports startTime, up to 2yr+).

        Returns DataFrame with ts (UTC), oi_usd columns.
        oi_usd is in base-currency units (same relative scale for pct changes).
        """
        url = f"{_BYBIT_BASE}/v5/market/open-interest"
        bybit_sym = self._bybit_symbol(symbol)
        start_ms = _ms(start)
        end_ms = _ms(end)
        all_rows: list[dict] = []
        cursor: str | None = None

        bybit_retries = 0
        while True:
            params: dict = {
                "category": "linear",
                "symbol": bybit_sym,
                "intervalTime": tf,
                "startTime": start_ms,
                "endTime": end_ms,
                "limit": 200,
            }
            if cursor:
                params["cursor"] = cursor
            try:
                data = await self._get_json(url, params)
            except Exception as exc:
                log.debug("[%s] Bybit OI error: %s", symbol, exc)
                break

            if not isinstance(data, dict):
                break

            # Bybit rate limit returns {"error": "Access too frequent."}
            if "error" in data and "frequent" in str(data.get("error", "")).lower():
                bybit_retries += 1
                if bybit_retries > 5:
                    log.warning("[%s] Bybit rate limit exceeded after 5 retries", symbol)
                    break
                wait = 10 * bybit_retries
                log.debug("[%s] Bybit rate limit, sleeping %ds (attempt %d)", symbol, wait, bybit_retries)
                await asyncio.sleep(wait)
                continue

            ret_code = data.get("retCode", -1)
            if ret_code != 0:
                log.debug("[%s] Bybit OI retCode=%s msg=%s", symbol,
                          ret_code, data.get("retMsg", ""))
                break

            result = data.get("result", {})
            rows = result.get("list", [])
            if not rows:
                break
            all_rows.extend(rows)
            bybit_retries = 0  # reset on success
            cursor = result.get("nextPageCursor") or None
            if not cursor:
                break

        if not all_rows:
            return pd.DataFrame()
        df = pd.DataFrame(all_rows)
        df["ts"] = pd.to_datetime(df["timestamp"].astype(int), unit="ms", utc=True)
        df["oi_usd"] = df["openInterest"].astype(float)
        return df[["ts", "oi_usd"]].sort_values("ts").drop_duplicates("ts")

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
        self, symbol: str, start: datetime, end: datetime, force: bool = False
    ) -> None:
        key = f"deriv:{symbol}"
        if not force and self._is_done(key):
            return

        funding = await self._fetch_funding(symbol, start, end)

        # OI: Bybit has startTime support (2yr+); Binance is hard-limited to 500 rows (~21d).
        # Fetch Bybit first, then append the last 21d from Binance for any gap.
        oi_bybit = await self._fetch_oi_bybit(symbol, start, end)
        oi_binance = await self._fetch_oi(symbol)
        if not oi_bybit.empty and not oi_binance.empty:
            oi = (
                pd.concat([oi_bybit, oi_binance])
                .drop_duplicates("ts")
                .sort_values("ts")
                .reset_index(drop=True)
            )
        else:
            oi = oi_bybit if not oi_bybit.empty else oi_binance

        ls = await self._fetch_longshort(symbol)

        if not funding.empty:
            self.store.write_funding(symbol, funding)
        if not oi.empty:
            self.store.write_oi(symbol, oi)
        if not ls.empty:
            self.store.write_longshort(symbol, ls)

        self._mark_done(key)
        log.info("[%s] derivatives done (funding=%d oi=%d[bybit=%d] ls=%d)",
                 symbol, len(funding), len(oi), len(oi_bybit), len(ls))

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
            self._bucket = _TokenBucket(self._rate)
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
        force: bool = False,
    ) -> dict[str, int]:
        """Backfill funding + OI + L/S for Futures symbols."""
        end = datetime.now(tz=timezone.utc)
        start = end - timedelta(days=30 * months)

        async with httpx.AsyncClient(headers={"User-Agent": _UA}, http2=True) as client:
            self._client = client
            self._bucket = _TokenBucket(self._rate)
            tasks = [
                self._backfill_one_derivatives(sym, start, end, force=force)
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
