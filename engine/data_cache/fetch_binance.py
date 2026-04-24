"""Binance spot kline fetcher — library function, no CLI.

Pages backwards from 'now' until the API returns an empty batch (i.e. before
the symbol's listing date). BTC goes back to ~2017-08, newer alts much
later. Intentionally uneven coverage — robustness signals come from that.

This module was moved from pattern-scanner-challenge/fetch.py as part of
Phase D1. The old module's SYMBOLS list now lives in
`universe.binance_30`, and the CLI entry point was dropped in favour of
`load_klines(...)` which lazily fetches on cache miss.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import pandas as pd

_LIMIT = 1000
_BINANCE_URL = "https://api.binance.com/api/v3/klines"
_SLEEP_BETWEEN_BATCHES = 0.25  # polite rate-limit buffer


def _fetch_batch(symbol: str, timeframe: str, end_ms: int) -> list[list]:
    """Fetch up to _LIMIT klines for (symbol, timeframe) ending at end_ms."""
    url = (
        f"{_BINANCE_URL}?symbol={symbol}"
        f"&interval={timeframe}&limit={_LIMIT}&endTime={end_ms}"
    )
    req = urllib.request.Request(
        url, headers={"User-Agent": "cogochi-autoresearch/data_cache"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        raise RuntimeError(f"HTTP {e.code} for {symbol}: {body}") from e


def fetch_klines_max(symbol: str, timeframe: str = "1h") -> pd.DataFrame:
    """Fetch the maximum available history for (symbol, timeframe).

    Returns a DataFrame indexed by UTC timestamp with columns:
        open, high, low, close, volume, quote_volume, trade_count,
        taker_buy_base_volume, taker_buy_quote_volume

    Raises RuntimeError if the symbol is delisted / invalid / returns no data.

    Intentionally does NOT persist to disk — that's the caller's job (see
    data_cache.loader.load_klines for the lazy read-or-fetch wrapper).
    """
    all_rows: list[list] = []
    end_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)

    while True:
        batch = _fetch_batch(symbol, timeframe, end_ms)
        if not batch:
            break
        # Prepend so all_rows ends up oldest-to-newest after the loop.
        all_rows = batch + all_rows
        oldest_open = batch[0][0]
        next_end_ms = oldest_open - 1
        if next_end_ms >= end_ms:
            # API isn't paging backwards; bail out instead of looping.
            break
        end_ms = next_end_ms
        time.sleep(_SLEEP_BETWEEN_BATCHES)

    if not all_rows:
        raise RuntimeError(f"no klines returned for {symbol}")

    df = pd.DataFrame(
        all_rows,
        columns=[
            "open_time", "open", "high", "low", "close", "volume",
            "close_time", "quote_volume", "trades",
            "taker_buy_base_volume", "taker_buy_quote_volume", "ignore",
        ],
    )
    numeric = [
        "open",
        "high",
        "low",
        "close",
        "volume",
        "quote_volume",
        "taker_buy_base_volume",
        "taker_buy_quote_volume",
    ]
    for col in numeric:
        df[col] = df[col].astype(float)
    df["trade_count"] = df["trades"].astype(int)
    df["timestamp"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    df = df[["timestamp"] + numeric + ["trade_count"]].set_index("timestamp")
    # Defensive dedupe: occasional batch overlap on the page boundary.
    df = df[~df.index.duplicated(keep="last")].sort_index()
    return df
