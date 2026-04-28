"""Coinalyze open-interest history fetcher with date-range pagination.

Mirrors the pattern in fetch_coinalyze_liquidations.py but targets the
/v1/open-interest-history endpoint and supports multi-batch pagination
to fetch beyond a single API limit.
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

from data_cache.coinalyze_credentials import resolve_coinalyze_api_key

log = logging.getLogger("engine.data_cache.coinalyze_oi")

_BASE_URL = "https://api.coinalyze.net/v1"
_UA = "cogochi-autoresearch/data_cache"
_INTERVAL_ALIASES: dict[str, str] = {
    "1m": "1min",
    "5m": "5min",
    "15m": "15min",
    "30m": "30min",
    "1h": "1hour",
    "4h": "4hour",
    "1d": "daily",
}
_INTERVAL_SECONDS: dict[str, int] = {
    "1min": 60,
    "5min": 300,
    "15min": 900,
    "30min": 1800,
    "1hour": 3600,
    "4hour": 14400,
    "daily": 86400,
}
_SLEEP = 0.5


def _coinalyze_symbol(symbol: str) -> str:
    return symbol.replace("/", "").upper() + "_PERP.A"


def _coinalyze_interval(timeframe: str) -> str:
    normalized = timeframe.strip().lower()
    interval = _INTERVAL_ALIASES.get(normalized)
    if interval is None:
        raise ValueError(f"unsupported coinalyze timeframe: {timeframe}")
    return interval


def _fetch_json(endpoint: str, params: dict[str, str]) -> list[dict]:
    resolution = resolve_coinalyze_api_key()
    if not resolution.present or resolution.value is None:
        raise RuntimeError("Coinalyze API key unavailable")

    query = urllib.parse.urlencode({**params, "api_key": resolution.value})
    url = f"{_BASE_URL}/{endpoint}?{query}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:200]
        raise RuntimeError(f"HTTP {exc.code} for {endpoint}: {body}") from exc
    if isinstance(payload, list):
        return payload
    if payload:
        return [payload]
    return []


def probe_oi_history_range(symbol: str, timeframe: str = "1h") -> tuple[datetime | None, datetime | None]:
    """Probe the earliest and latest timestamps available for OI history.

    Returns (earliest_ts, latest_ts) or (None, None) on failure.
    Useful for Q1 spike: check actual max range before committing to backfill.
    """
    interval = _coinalyze_interval(timeframe)
    interval_secs = _INTERVAL_SECONDS[interval]
    now = int(datetime.now(timezone.utc).timestamp())

    # Probe range: start from 120 days ago (max that free/mid tier allows)
    from_ts = now - 120 * 86400
    to_ts = from_ts + interval_secs * 10

    try:
        rows = _fetch_json(
            "open-interest-history",
            {
                "symbols": _coinalyze_symbol(symbol),
                "interval": interval,
                "from": str(from_ts),
                "to": str(to_ts),
            },
        )
        if rows and isinstance(rows[0].get("history"), list) and rows[0]["history"]:
            earliest_raw = rows[0]["history"][0].get("t")
            if earliest_raw:
                earliest = datetime.fromtimestamp(int(earliest_raw), tz=timezone.utc)
                latest_rows = _fetch_json(
                    "open-interest-history",
                    {
                        "symbols": _coinalyze_symbol(symbol),
                        "interval": interval,
                        "from": str(now - interval_secs * 10),
                        "to": str(now),
                    },
                )
                latest_ts = None
                if latest_rows and isinstance(latest_rows[0].get("history"), list):
                    last = latest_rows[0]["history"][-1].get("t")
                    if last:
                        latest_ts = datetime.fromtimestamp(int(last), tz=timezone.utc)
                return earliest, latest_ts
    except Exception as exc:
        log.warning("OI range probe failed for %s: %s", symbol, exc)

    return None, None


def fetch_coinalyze_oi_history(
    symbol: str,
    *,
    start: datetime,
    end: datetime | None = None,
    timeframe: str = "1h",
    batch_days: int = 30,
) -> pd.DataFrame:
    """Fetch Coinalyze OI history for the given date range, paginating in batches.

    Args:
        symbol: Binance-style symbol (e.g. "BTCUSDT")
        start: earliest datetime to fetch (inclusive)
        end: latest datetime (defaults to now)
        timeframe: "1h", "4h", "1d", etc.
        batch_days: days per API request (Coinalyze limit-based)

    Returns:
        DataFrame with columns [oi_usd] indexed by UTC timestamp.
    """
    interval = _coinalyze_interval(timeframe)
    interval_secs = _INTERVAL_SECONDS[interval]
    end = end or datetime.now(tz=timezone.utc)

    from_ts = int(start.timestamp())
    to_ts = int(end.timestamp())
    batch_secs = batch_days * 86400

    all_rows: list[dict] = []
    current_from = from_ts

    log.info("[%s] Coinalyze OI backfill %s → %s (%s)", symbol, start.date(), end.date(), interval)

    while current_from < to_ts:
        current_to = min(current_from + batch_secs, to_ts)
        try:
            rows = _fetch_json(
                "open-interest-history",
                {
                    "symbols": _coinalyze_symbol(symbol),
                    "interval": interval,
                    "from": str(current_from),
                    "to": str(current_to),
                },
            )
        except RuntimeError as exc:
            log.warning("[%s] OI batch failed from=%d: %s", symbol, current_from, exc)
            break

        if rows and isinstance(rows[0].get("history"), list):
            for point in rows[0]["history"]:
                if not isinstance(point, dict):
                    continue
                t = point.get("t")
                v = point.get("v")  # open interest value
                # Coinalyze returns OHLC format: o/h/l/c — use close (c) for OI
                v = point.get("c")
                if t is not None and v is not None:
                    all_rows.append({"t": int(t), "oi_usd": float(v)})

        current_from = current_to + interval_secs
        time.sleep(_SLEEP)

    if not all_rows:
        log.warning("[%s] no Coinalyze OI rows returned", symbol)
        return pd.DataFrame()

    df = pd.DataFrame(all_rows)
    df["timestamp"] = pd.to_datetime(df["t"], unit="s", utc=True)
    df = df.set_index("timestamp")[["oi_usd"]]
    df = df[~df.index.duplicated(keep="last")].sort_index()
    log.info("[%s] OI fetched: %d rows, %s → %s", symbol, len(df), df.index[0].date(), df.index[-1].date())
    return df
