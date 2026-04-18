"""Coinbase Exchange public candle fetcher.

Endpoint: api.exchange.coinbase.com/products/BTC-USD/candles
No authentication required — public market data.

Returns daily BTC-USD close price which is compared against Binance
BTCUSDT daily close to compute the Coinbase Premium Index (CPI):

    coinbase_premium = (coinbase_close - binance_close) / binance_close

Positive premium → US / institutional buyers are paying above the global
spot price → bullish macro signal used by on-chain analysts to confirm
that institutional money is entering (as popularised by CryptoQuant CPI).

Anchor (Coinbase Premium as institutional signal):
  - Ki Young Ju (CryptoQuant, 2020): Coinbase price premium over Binance
    correlates with spot ETF and OTC desk accumulation.
  - Glassnode & CryptoQuant research (2021-2024): sustained positive CPI
    precedes BTC price appreciation on 12-24h horizon.
  - Fang et al. (2022), "Price discovery in bitcoin spot or futures?" —
    US-listed exchanges (including Coinbase) lead price formation during
    US trading hours, consistent with institutional flow dominance.
"""
from __future__ import annotations

import json
import time
import urllib.request
from datetime import datetime, timedelta, timezone

import pandas as pd

_UA = "cogochi-autoresearch/data_cache"
_TIMEOUT = 15
_BASE = "https://api.exchange.coinbase.com"
_BINANCE_BASE = "https://api.binance.com"

# Coinbase API max candles per request
_CB_LIMIT = 300
# granularity in seconds for daily candles
_GRANULARITY_DAILY = 86400


def _get_json(url: str) -> dict | list:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": _UA, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _fetch_coinbase_daily(days: int) -> pd.DataFrame:
    """Fetch daily BTC-USD candles from Coinbase Exchange.

    Returns DataFrame with columns: coinbase_btc_open, coinbase_btc_close.
    Index: UTC DatetimeIndex (daily).
    """
    end_dt = datetime.now(tz=timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    start_dt = end_dt - timedelta(days=days + 1)

    url = (
        f"{_BASE}/products/BTC-USD/candles"
        f"?granularity={_GRANULARITY_DAILY}"
        f"&start={start_dt.strftime('%Y-%m-%dT%H:%M:%SZ')}"
        f"&end={end_dt.strftime('%Y-%m-%dT%H:%M:%SZ')}"
    )
    data = _get_json(url)

    if not data:
        raise RuntimeError("coinbase: no candle data returned")

    # Coinbase format: [time, low, high, open, close, volume]
    rows = []
    for candle in data:
        ts, _low, _high, open_, close, _vol = candle
        rows.append({
            "date": datetime.fromtimestamp(int(ts), tz=timezone.utc).date(),
            "coinbase_btc_open": float(open_),
            "coinbase_btc_close": float(close),
        })

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"], utc=True)
    df = df.set_index("date").sort_index()
    df = df[~df.index.duplicated(keep="last")]
    return df


def _fetch_binance_daily_btc(days: int) -> pd.Series:
    """Fetch daily BTCUSDT close from Binance (for premium computation)."""
    limit = min(days + 2, 1000)
    url = (
        f"{_BINANCE_BASE}/api/v3/klines"
        f"?symbol=BTCUSDT&interval=1d&limit={limit}"
    )
    data = _get_json(url)

    rows = []
    for k in data:
        ts_ms = int(k[0])
        close = float(k[4])
        rows.append({
            "date": datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
            .replace(hour=0, minute=0, second=0, microsecond=0),
            "binance_btc_close": close,
        })

    df = pd.DataFrame(rows).set_index("date").sort_index()
    return df["binance_btc_close"]


def fetch_coinbase_premium(days: int = 365) -> pd.DataFrame | None:
    """Fetch Coinbase Premium Index vs Binance for the last `days` days.

    Returns a daily DataFrame with columns:
        coinbase_premium      — (coinbase_close - binance_close) / binance_close
                                Positive = US/institutional buying premium.
        coinbase_premium_norm — rolling z-score (window=30d), capped [-3, 3].
                                0 = neutral, >1 = significantly elevated.
    Index: UTC DatetimeIndex, daily frequency.

    Returns None on network failure (caller uses default fill value).
    """
    try:
        cb = _fetch_coinbase_daily(days)
        bn = _fetch_binance_daily_btc(days)

        merged = cb.join(bn, how="inner")
        if merged.empty:
            return None

        merged["coinbase_premium"] = (
            (merged["coinbase_btc_close"] - merged["binance_btc_close"])
            / merged["binance_btc_close"]
        )

        roll_mean = merged["coinbase_premium"].rolling(30, min_periods=5).mean()
        roll_std = merged["coinbase_premium"].rolling(30, min_periods=5).std()
        merged["coinbase_premium_norm"] = (
            (merged["coinbase_premium"] - roll_mean) / roll_std.replace(0, float("nan"))
        ).clip(-3, 3).fillna(0.0)

        return merged[["coinbase_premium", "coinbase_premium_norm"]].dropna(
            subset=["coinbase_premium"]
        )

    except Exception:
        return None
