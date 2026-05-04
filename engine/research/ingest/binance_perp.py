"""Binance USDT-M futures HTTP client with rate-limit guard.

Endpoints:
    /fapi/v1/klines                       — OHLCV klines
    /futures/data/openInterestHist        — Open interest history
    /fapi/v1/fundingRate                  — Funding rate history

Weight budget: 1200 requests/minute (Binance default).
This client tracks consumed weight and sleeps when approaching the limit.

Column contracts (all DataFrames returned have ts_ms as integer):
    klines:  ts_ms, open, high, low, close, volume, quote_volume, trades,
             taker_buy_volume, taker_buy_quote
    oi:      ts_ms, open_interest, sum_open_interest_value
    funding: ts_ms, funding_rate, mark_price
"""
from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any

import pandas as pd

log = logging.getLogger("engine.research.ingest.binance_perp")

_BASE = "https://fapi.binance.com"
_UA = "wtd-v2-research/ingest"

# Binance rate-limit window = 1 minute, budget = 1200 weight units
_WEIGHT_WINDOW_SECS = 60
_WEIGHT_BUDGET = 1200
# Conservative threshold — leave 100 units as headroom
_WEIGHT_THRESHOLD = _WEIGHT_BUDGET - 100

# Max rows per klines request
_KLINES_LIMIT = 1500
# Max rows per OI request
_OI_LIMIT = 500
# Max rows per fundingRate request
_FUNDING_LIMIT = 1000


@dataclass
class _RateLimiter:
    """Token-bucket style rate limiter tracking Binance weight usage."""

    window_secs: float = _WEIGHT_WINDOW_SECS
    budget: int = _WEIGHT_BUDGET
    threshold: int = _WEIGHT_THRESHOLD
    _lock: Lock = field(default_factory=Lock, repr=False)
    _consumed: int = field(default=0, repr=False)
    _window_start: float = field(default_factory=time.monotonic, repr=False)

    def _reset_if_needed(self) -> None:
        now = time.monotonic()
        if now - self._window_start >= self.window_secs:
            self._consumed = 0
            self._window_start = now

    def consume(self, weight: int = 1) -> None:
        """Record weight usage; sleep if threshold reached."""
        with self._lock:
            self._reset_if_needed()
            if self._consumed + weight >= self.threshold:
                remaining = self.window_secs - (time.monotonic() - self._window_start)
                sleep_secs = max(0.0, remaining) + 0.5
                log.warning(
                    "Rate-limit threshold hit (%d/%d used). Sleeping %.1fs",
                    self._consumed,
                    self.budget,
                    sleep_secs,
                )
                time.sleep(sleep_secs)
                self._reset_if_needed()
            self._consumed += weight
            log.debug("Weight: %d/%d consumed this window", self._consumed, self.budget)


# Module-level rate limiter (shared across all client calls in a process)
_limiter = _RateLimiter()


def _fetch_json(path: str, weight: int = 1) -> Any:
    """Execute a GET request and return parsed JSON, respecting rate limit."""
    _limiter.consume(weight)
    url = f"{_BASE}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:300]
        if exc.code == 429:
            # Hard rate-limit hit — wait 60s then retry once
            log.error("HTTP 429 from Binance. Sleeping 65s then retrying once.")
            time.sleep(65)
            _limiter.consume(weight)
            req2 = urllib.request.Request(url, headers={"User-Agent": _UA})
            with urllib.request.urlopen(req2, timeout=30) as resp2:
                return json.loads(resp2.read().decode("utf-8"))
        raise RuntimeError(f"HTTP {exc.code} for {url}: {body}") from exc


# ── Klines ─────────────────────────────────────────────────────────────────────


def fetch_klines_range(
    symbol: str,
    interval: str,
    start_ms: int,
    end_ms: int,
) -> pd.DataFrame:
    """Fetch OHLCV klines for [start_ms, end_ms] (inclusive, ms timestamps).

    Pages through the API automatically. Returns DataFrame with columns:
        ts_ms, open, high, low, close, volume, quote_volume, trades,
        taker_buy_volume, taker_buy_quote
    """
    all_rows: list[list] = []
    cursor_start = start_ms

    while cursor_start <= end_ms:
        path = (
            f"/fapi/v1/klines?symbol={symbol}"
            f"&interval={interval}"
            f"&startTime={cursor_start}"
            f"&endTime={end_ms}"
            f"&limit={_KLINES_LIMIT}"
        )
        # klines weight = 1 for limit<=100, 2 for <=500, 5 for <=1000, 10 for <=1500
        batch: list[list] = _fetch_json(path, weight=10)
        if not batch:
            break
        all_rows.extend(batch)
        last_open_ms: int = batch[-1][0]
        if last_open_ms >= end_ms:
            break
        cursor_start = last_open_ms + 1

    if not all_rows:
        return pd.DataFrame(
            columns=["ts_ms", "open", "high", "low", "close", "volume",
                     "quote_volume", "trades", "taker_buy_volume", "taker_buy_quote"]
        )

    df = pd.DataFrame(
        all_rows,
        columns=[
            "ts_ms", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades",
            "taker_buy_volume", "taker_buy_quote", "_ignore",
        ],
    )
    _float_cols = ["open", "high", "low", "close", "volume",
                   "quote_volume", "taker_buy_volume", "taker_buy_quote"]
    for col in _float_cols:
        df[col] = df[col].astype(float)
    df["ts_ms"] = df["ts_ms"].astype("int64")
    df["trades"] = df["trades"].astype("int64")
    df = df[["ts_ms", "open", "high", "low", "close", "volume",
             "quote_volume", "trades", "taker_buy_volume", "taker_buy_quote"]]
    df = df.drop_duplicates(subset=["ts_ms"]).sort_values("ts_ms").reset_index(drop=True)
    return df


# ── Open Interest History ──────────────────────────────────────────────────────


def fetch_oi_range(
    symbol: str,
    period: str,
    start_ms: int,
    end_ms: int,
) -> pd.DataFrame:
    """Fetch open interest history for [start_ms, end_ms].

    Returns DataFrame with columns: ts_ms, open_interest, sum_open_interest_value

    Note: Binance OI history only goes back ~30 days for 5m period,
    ~90 days for 1h period. Older data is not available.
    """
    all_rows: list[dict] = []
    cursor_start = start_ms

    while cursor_start <= end_ms:
        path = (
            f"/futures/data/openInterestHist?symbol={symbol}"
            f"&period={period}"
            f"&startTime={cursor_start}"
            f"&endTime={end_ms}"
            f"&limit={_OI_LIMIT}"
        )
        batch: list[dict] = _fetch_json(path, weight=1)
        if not batch:
            break
        all_rows.extend(batch)
        last_ts: int = batch[-1]["timestamp"]
        if last_ts >= end_ms or len(batch) < _OI_LIMIT:
            break
        cursor_start = last_ts + 1

    if not all_rows:
        return pd.DataFrame(
            columns=["ts_ms", "open_interest", "sum_open_interest_value"]
        )

    df = pd.DataFrame(all_rows)
    df = df.rename(columns={
        "timestamp": "ts_ms",
        "sumOpenInterest": "open_interest",
        "sumOpenInterestValue": "sum_open_interest_value",
    })
    df["ts_ms"] = df["ts_ms"].astype("int64")
    df["open_interest"] = df["open_interest"].astype(float)
    df["sum_open_interest_value"] = df["sum_open_interest_value"].astype(float)
    df = df[["ts_ms", "open_interest", "sum_open_interest_value"]]
    df = df.drop_duplicates(subset=["ts_ms"]).sort_values("ts_ms").reset_index(drop=True)
    return df


# ── Funding Rate ───────────────────────────────────────────────────────────────


def fetch_funding_range(
    symbol: str,
    start_ms: int,
    end_ms: int,
) -> pd.DataFrame:
    """Fetch funding rate history for [start_ms, end_ms].

    Returns DataFrame with columns: ts_ms, funding_rate, mark_price
    Binance funding interval: 8h. Max 1000 rows per request (~333 days).
    """
    all_rows: list[dict] = []
    cursor_start = start_ms

    while cursor_start <= end_ms:
        path = (
            f"/fapi/v1/fundingRate?symbol={symbol}"
            f"&startTime={cursor_start}"
            f"&endTime={end_ms}"
            f"&limit={_FUNDING_LIMIT}"
        )
        batch: list[dict] = _fetch_json(path, weight=1)
        if not batch:
            break
        all_rows.extend(batch)
        last_ts: int = batch[-1]["fundingTime"]
        if last_ts >= end_ms or len(batch) < _FUNDING_LIMIT:
            break
        cursor_start = last_ts + 1

    if not all_rows:
        return pd.DataFrame(columns=["ts_ms", "funding_rate", "mark_price"])

    df = pd.DataFrame(all_rows)
    df = df.rename(columns={"fundingTime": "ts_ms", "fundingRate": "funding_rate",
                             "markPrice": "mark_price"})
    df["ts_ms"] = df["ts_ms"].astype("int64")
    df["funding_rate"] = df["funding_rate"].astype(float)
    df["mark_price"] = df["mark_price"].astype(float)
    df = df[["ts_ms", "funding_rate", "mark_price"]]
    df = df.drop_duplicates(subset=["ts_ms"]).sort_values("ts_ms").reset_index(drop=True)
    return df


# ── Helpers ────────────────────────────────────────────────────────────────────


def now_ms() -> int:
    """Current UTC time in milliseconds."""
    return int(datetime.now(tz=timezone.utc).timestamp() * 1000)


def days_ago_ms(days: int) -> int:
    """UTC timestamp in ms for N days ago from now."""
    return now_ms() - days * 86_400_000
