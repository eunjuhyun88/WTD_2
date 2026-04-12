"""Binance USDT-M futures perp fetcher — funding, OI, long/short ratio.

Companion to `fetch_binance.py` (spot klines). Pages each endpoint once
with the maximum `limit` the API allows, then merges the three series
onto a single 1h UTC DatetimeIndex.

The underlying endpoints have VERY different histories:

  - /fapi/v1/fundingRate       → ~1000 records, 8h interval
                                 = ~333 days back
  - /futures/data/openInterestHist?period=1h&limit=500
                                 → ~500 hourly records = ~20 days back
  - /futures/data/globalLongShortAccountRatio?period=1h&limit=500
                                 → ~500 hourly records = ~20 days back

Older bars are padded with neutral defaults (funding=0, oi_change=0,
ls_ratio=1) so that historical backtests don't crash — they simply have
perp-derived blocks effectively off on pre-history bars. See
`data_cache.loader.load_perp` for the lazy cache wrapper and
`scanner.feature_calc.compute_features_table` for how the perp frame is
merged into the feature table.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

import pandas as pd

_FUTURES_URL = "https://fapi.binance.com"
_SLEEP_BETWEEN = 0.25
_UA = "cogochi-autoresearch/data_cache"


def _fetch_json(path: str) -> list:
    url = f"{_FUTURES_URL}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        raise RuntimeError(f"HTTP {e.code} for {path}: {body}") from e


def fetch_funding_rate(symbol: str, limit: int = 1000) -> pd.DataFrame:
    """Fetch funding rate history (8h interval).

    Returns a DataFrame indexed by UTC timestamp with a single
    `funding_rate` float column. Newest → oldest order from Binance is
    sorted to oldest → newest before returning.
    """
    rows = _fetch_json(f"/fapi/v1/fundingRate?symbol={symbol}&limit={limit}")
    if not rows:
        raise RuntimeError(f"no funding rate rows for {symbol}")
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["fundingTime"], unit="ms", utc=True)
    df["funding_rate"] = df["fundingRate"].astype(float)
    return df[["timestamp", "funding_rate"]].set_index("timestamp").sort_index()


def fetch_oi_hist(symbol: str, period: str = "1h", limit: int = 500) -> pd.DataFrame:
    """Fetch open interest history.

    Returns a DataFrame indexed by UTC timestamp with:
        oi              — raw sumOpenInterest (base units)
        oi_change_1h    — fractional change vs 1 bar ago
        oi_change_24h   — fractional change vs 24 bars ago
    """
    rows = _fetch_json(
        f"/futures/data/openInterestHist?symbol={symbol}"
        f"&period={period}&limit={limit}"
    )
    if not rows:
        raise RuntimeError(f"no OI hist rows for {symbol}")
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df["oi"] = df["sumOpenInterest"].astype(float)
    df = df[["timestamp", "oi"]].set_index("timestamp").sort_index()
    df["oi_change_1h"] = df["oi"].pct_change(1).fillna(0.0)
    df["oi_change_24h"] = df["oi"].pct_change(24).fillna(0.0)
    return df


def fetch_ls_ratio(symbol: str, period: str = "1h", limit: int = 500) -> pd.DataFrame:
    """Fetch global long/short account ratio history.

    Returns a DataFrame indexed by UTC timestamp with `long_short_ratio`.
    """
    rows = _fetch_json(
        f"/futures/data/globalLongShortAccountRatio?symbol={symbol}"
        f"&period={period}&limit={limit}"
    )
    if not rows:
        raise RuntimeError(f"no LS ratio rows for {symbol}")
    df = pd.DataFrame(rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df["long_short_ratio"] = df["longShortRatio"].astype(float)
    return df[["timestamp", "long_short_ratio"]].set_index("timestamp").sort_index()


def fetch_perp_max(symbol: str) -> pd.DataFrame:
    """Fetch all three perp series and merge onto a 1h UTC index.

    The union of the three series' indexes forms the output index. Funding
    (8h cadence) is forward-filled onto the 1h grid so a single funding
    event "sticks" for 8 bars. OI and LS are not ffilled — they arrive on
    hourly cadence from Binance and any missing bar stays NaN.

    Final fillna: funding=0, oi_change_*=0, long_short_ratio=1.

    Returns columns:
        funding_rate, oi_change_1h, oi_change_24h, long_short_ratio
    """
    funding = fetch_funding_rate(symbol)
    time.sleep(_SLEEP_BETWEEN)
    oi = fetch_oi_hist(symbol)
    time.sleep(_SLEEP_BETWEEN)
    ls = fetch_ls_ratio(symbol)

    # Resample funding onto the 1h grid that OI uses, then ffill up to 8
    # hours so each funding event persists over its interval.
    funding_1h = funding.resample("1h").ffill(limit=8)

    merged = oi[["oi_change_1h", "oi_change_24h"]].join(
        ls[["long_short_ratio"]], how="outer"
    )
    merged = merged.join(funding_1h[["funding_rate"]], how="outer")

    merged["funding_rate"] = merged["funding_rate"].fillna(0.0)
    merged["oi_change_1h"] = merged["oi_change_1h"].fillna(0.0)
    merged["oi_change_24h"] = merged["oi_change_24h"].fillna(0.0)
    merged["long_short_ratio"] = merged["long_short_ratio"].fillna(1.0)

    return merged[
        ["funding_rate", "oi_change_1h", "oi_change_24h", "long_short_ratio"]
    ]
