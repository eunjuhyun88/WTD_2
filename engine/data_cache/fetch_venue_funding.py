"""Per-venue funding rate fetcher — Binance + Bybit + OKX (public endpoints).

Returns a DataFrame with columns:
  binance_funding  — Binance USDT-M perpetual funding rate (8h interval)
  bybit_funding    — Bybit linear perpetual funding rate (8h interval)
  okx_funding      — OKX USDT swap funding rate (8h interval)

All 3 exchange APIs are public (no auth required).
Index: UTC DatetimeIndex at the funding settle timestamps.

Used by: venue_funding_spread_extreme building block.
"""
from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import pandas as pd

log = logging.getLogger("engine.data_cache.venue_funding")

_BINANCE_FUTURES = "https://fapi.binance.com"
_BYBIT = "https://api.bybit.com"
_OKX = "https://www.okx.com"
_UA = "cogochi-autoresearch/data_cache"
_SLEEP = 0.3  # throttle between exchange calls


def _get(url: str, params: dict | None = None) -> list | dict:
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        log.warning("fetch_venue_funding HTTP error %s: %s", url, exc)
        return []


def _fetch_binance_funding(symbol: str, limit: int) -> pd.Series:
    """Binance /fapi/v1/fundingRate — returns up to 1000 8h records."""
    rows = _get(f"{_BINANCE_FUTURES}/fapi/v1/fundingRate", {
        "symbol": symbol.upper(),
        "limit": min(limit, 1000),
    })
    if not isinstance(rows, list) or not rows:
        return pd.Series(dtype=float, name="binance_funding")
    df = pd.DataFrame(rows)
    df["ts"] = pd.to_datetime(df["fundingTime"].astype("int64"), unit="ms", utc=True)
    df["binance_funding"] = df["fundingRate"].astype(float)
    return df.set_index("ts")["binance_funding"].sort_index()


def _bybit_symbol(symbol: str) -> str:
    return symbol.upper()


def _fetch_bybit_funding(symbol: str, limit: int) -> pd.Series:
    """Bybit /v5/market/funding/history — linear perp, up to 200 records per call."""
    rows_all: list[dict] = []
    cursor: str | None = None
    remaining = min(limit, 1000)
    while remaining > 0:
        params: dict = {
            "category": "linear",
            "symbol": _bybit_symbol(symbol),
            "limit": min(remaining, 200),
        }
        if cursor:
            params["cursor"] = cursor
        payload = _get(f"{_BYBIT}/v5/market/funding/history", params)
        if not isinstance(payload, dict) or payload.get("retCode") != 0:
            break
        result = payload.get("result", {})
        rows = result.get("list", [])
        if not rows:
            break
        rows_all.extend(rows)
        remaining -= len(rows)
        cursor = result.get("nextPageCursor")
        if not cursor:
            break
        time.sleep(_SLEEP)
    if not rows_all:
        return pd.Series(dtype=float, name="bybit_funding")
    df = pd.DataFrame(rows_all)
    df["ts"] = pd.to_datetime(df["fundingRateTimestamp"].astype("int64"), unit="ms", utc=True)
    df["bybit_funding"] = df["fundingRate"].astype(float)
    return df.set_index("ts")["bybit_funding"].sort_index()


def _okx_inst_id(symbol: str) -> str:
    base = symbol.upper().removesuffix("USDT")
    return f"{base}-USDT-SWAP"


def _fetch_okx_funding(symbol: str, limit: int) -> pd.Series:
    """OKX /api/v5/public/funding-rate-history — 100 records per page."""
    rows_all: list[dict] = []
    after: str | None = None
    remaining = min(limit, 1000)
    while remaining > 0:
        params: dict = {
            "instId": _okx_inst_id(symbol),
            "limit": min(remaining, 100),
        }
        if after:
            params["after"] = after
        payload = _get(f"{_OKX}/api/v5/public/funding-rate-history", params)
        if not isinstance(payload, dict) or payload.get("code") != "0":
            break
        rows = payload.get("data", [])
        if not rows:
            break
        rows_all.extend(rows)
        remaining -= len(rows)
        after = rows[-1].get("fundingTime")
        time.sleep(_SLEEP)
    if not rows_all:
        return pd.Series(dtype=float, name="okx_funding")
    df = pd.DataFrame(rows_all)
    df["ts"] = pd.to_datetime(df["fundingTime"].astype("int64"), unit="ms", utc=True)
    df["okx_funding"] = df["fundingRate"].astype(float)
    return df.set_index("ts")["okx_funding"].sort_index()


def empty_venue_funding_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=["binance_funding", "bybit_funding", "okx_funding"])


def fetch_venue_funding(
    symbol: str,
    *,
    limit: int = 90,
) -> pd.DataFrame:
    """Fetch per-venue funding rates and merge into a single DataFrame.

    Args:
        symbol: Binance-style symbol (e.g. "BTCUSDT").
        limit:  Approximate number of 8h periods to fetch per exchange (~30 days default).

    Returns:
        DataFrame with columns binance_funding, bybit_funding, okx_funding.
        Index is UTC DatetimeIndex at funding settle times.
        Any missing venue returns NaN for that column.
    """
    frames: list[pd.Series] = []

    try:
        s = _fetch_binance_funding(symbol, limit)
        if not s.empty:
            frames.append(s)
    except Exception as exc:
        log.warning("binance funding fetch failed: %s", exc)
    time.sleep(_SLEEP)

    try:
        s = _fetch_bybit_funding(symbol, limit)
        if not s.empty:
            frames.append(s)
    except Exception as exc:
        log.warning("bybit funding fetch failed: %s", exc)
    time.sleep(_SLEEP)

    try:
        s = _fetch_okx_funding(symbol, limit)
        if not s.empty:
            frames.append(s)
    except Exception as exc:
        log.warning("okx funding fetch failed: %s", exc)

    if not frames:
        return empty_venue_funding_frame()

    df = pd.concat(frames, axis=1)
    df = df[~df.index.duplicated(keep="last")].sort_index()
    for col in ("binance_funding", "bybit_funding", "okx_funding"):
        if col not in df.columns:
            df[col] = float("nan")
    return df[["binance_funding", "bybit_funding", "okx_funding"]]
