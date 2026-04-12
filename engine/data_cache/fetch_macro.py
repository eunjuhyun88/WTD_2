"""Macro & sentiment data fetchers for the Python engine.

All endpoints are free / no-auth:
  - Fear & Greed : alternative.me/fng  (daily, up to 365d)
  - BTC Dominance: CoinGecko market_cap_chart (daily, up to 365d)
  - DXY / VIX / SPX: Yahoo Finance v8 chart API (daily, multi-year)

Each fetcher returns a DataFrame indexed by UTC date (daily cadence).
Use `load_macro_bundle()` in data_cache.loader to merge + forward-fill
onto an hourly klines index.
"""
from __future__ import annotations

import json
import time
import urllib.request
from datetime import datetime, timedelta, timezone

import pandas as pd

_UA = "cogochi-autoresearch/data_cache"
_TIMEOUT = 10


def _get_json(url: str) -> dict | list:
    req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ─── Fear & Greed ────────────────────────────────────────────────────────────

def fetch_fear_greed(days: int = 365) -> pd.DataFrame:
    """Fetch Fear & Greed Index history from alternative.me.

    Returns a daily DataFrame with columns:
        fear_greed      — raw value 0-100 (extreme fear→0, extreme greed→100)
        fear_greed_norm — contrarian normalised: +1 = extreme fear (bullish),
                          -1 = extreme greed (bearish)
    Index: UTC DatetimeIndex, daily frequency.
    """
    limit = max(1, min(365, days))
    url = f"https://api.alternative.me/fng/?limit={limit}&format=json"
    payload = _get_json(url)

    rows = payload.get("data", []) if isinstance(payload, dict) else []
    records = []
    for row in rows:
        val = row.get("value")
        ts = row.get("timestamp")
        if val is None or ts is None:
            continue
        records.append({
            "date": datetime.fromtimestamp(int(ts), tz=timezone.utc).date(),
            "fear_greed": float(val),
        })

    if not records:
        raise RuntimeError("fear_greed: no data returned")

    df = pd.DataFrame(records).set_index("date")
    df.index = pd.to_datetime(df.index, utc=True)
    df = df.sort_index()
    df["fear_greed_norm"] = 1.0 - df["fear_greed"] / 50.0  # 50→0, 0→+1, 100→-1
    return df[["fear_greed", "fear_greed_norm"]]


# ─── BTC Dominance (Binance price + CoinPaprika snapshot) ────────────────────
# Historical BTC dominance APIs are mostly paywalled.
# Approach: anchor to the current real dominance (CoinPaprika /v1/global, free)
# and scale historically using BTC daily price from Binance.
# Reasoning: BTC dominance rises when BTC outperforms altcoins, which is
# directionally correlated with BTC price rising. The approximation is good
# enough as a signal feature and costs zero API credits.

_PAPRIKA_GLOBAL = "https://api.coinpaprika.com/v1/global"


def fetch_btc_dominance(days: int = 365) -> pd.DataFrame:
    """Approximate BTC dominance history using Binance daily price + CoinPaprika snapshot.

    Formula: btc_dominance[t] = current_dominance × (btc_price[t] / btc_price_now)
    Anchored to CoinPaprika's real-time global.bitcoin_dominance_percentage.

    Returns a daily DataFrame with column:
        btc_dominance — BTC % of total crypto market cap (approximated)
    Index: UTC DatetimeIndex, daily frequency.
    """
    # 1. Current dominance from CoinPaprika free global endpoint
    global_data: dict = _get_json(_PAPRIKA_GLOBAL)
    current_dom = float(global_data.get("bitcoin_dominance_percentage", 50.0))

    time.sleep(0.3)

    # 2. BTC daily price history from Binance (already in data_cache)
    from data_cache.fetch_binance import fetch_klines_max  # local import avoids circular
    klines = fetch_klines_max("BTCUSDT", "1d")

    btc_price = klines["close"].astype(float)
    btc_price.index = pd.to_datetime(btc_price.index, utc=True)
    btc_price = btc_price.tail(days)

    price_now = float(btc_price.iloc[-1])
    if price_now == 0:
        raise RuntimeError("btc_dominance: BTC price is zero")

    # 3. Scale historical dominance proportionally to BTC price movements
    dom_series = (current_dom * btc_price / price_now).clip(0, 100)

    df = pd.DataFrame({"btc_dominance": dom_series})
    df.index = df.index.normalize()
    return df.dropna()


# ─── Yahoo Finance (DXY / VIX / SPX) ─────────────────────────────────────────

_YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"

_MACRO_SYMBOLS = {
    "dxy": "DX-Y.NYB",   # US Dollar Index
    "vix": "^VIX",        # CBOE Volatility Index
    "spx": "^GSPC",       # S&P 500
}


def _fetch_yahoo_daily(ticker: str, days: int = 365) -> pd.DataFrame:
    """Fetch daily OHLCV for a Yahoo Finance ticker."""
    range_str = f"{days}d"
    url = (
        f"{_YAHOO_BASE}/{ticker}"
        f"?range={range_str}&interval=1d&includePrePost=false"
    )
    try:
        payload = _get_json(url)
    except Exception as e:
        raise RuntimeError(f"Yahoo Finance fetch failed for {ticker}: {e}") from e

    result = payload.get("chart", {}).get("result", [{}])[0]
    timestamps = result.get("timestamp", [])
    quote = result.get("indicators", {}).get("quote", [{}])[0]
    closes = quote.get("close", [])

    records = []
    for ts, c in zip(timestamps, closes):
        if c is None:
            continue
        records.append({
            "date": datetime.fromtimestamp(ts, tz=timezone.utc).date(),
            "close": float(c),
        })

    if not records:
        raise RuntimeError(f"Yahoo Finance: no data for {ticker}")

    df = pd.DataFrame(records).set_index("date")
    df.index = pd.to_datetime(df.index, utc=True)
    return df.sort_index()


def fetch_macro_yahoo(days: int = 365) -> pd.DataFrame:
    """Fetch DXY, VIX, SPX from Yahoo Finance and compute slopes.

    Returns a daily DataFrame with columns:
        dxy_close     — US Dollar Index close
        dxy_slope_5d  — 5-day % change (rising DXY → bearish crypto)
        vix_close     — VIX level (>30 = high fear, >20 = elevated)
        spx_slope_5d  — 5-day % change (S&P trend, + correl to crypto)
    Index: UTC DatetimeIndex, daily frequency.
    """
    frames = {}
    for key, ticker in _MACRO_SYMBOLS.items():
        try:
            frames[key] = _fetch_yahoo_daily(ticker, days)
            time.sleep(0.3)
        except Exception as e:
            print(f"  [macro] Yahoo {ticker} failed: {e}")
            frames[key] = None

    result_frames = []
    col_map = {
        "dxy": "dxy_close",
        "vix": "vix_close",
        "spx": "spx_close",
    }

    for key, col in col_map.items():
        if frames.get(key) is not None:
            df = frames[key].rename(columns={"close": col})
            result_frames.append(df[[col]])

    if not result_frames:
        raise RuntimeError("Yahoo Finance: all macro tickers failed")

    merged = result_frames[0]
    for df in result_frames[1:]:
        merged = merged.join(df, how="outer")

    # Fill gaps (weekends, holidays) by forward-fill
    merged = merged.sort_index().ffill(limit=5)

    # Compute 5-day slopes (% change)
    if "dxy_close" in merged.columns:
        merged["dxy_slope_5d"] = merged["dxy_close"].pct_change(5).fillna(0.0)
    if "spx_close" in merged.columns:
        merged["spx_slope_5d"] = merged["spx_close"].pct_change(5).fillna(0.0)

    return merged.dropna(how="all")
