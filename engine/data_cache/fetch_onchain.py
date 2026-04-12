"""On-chain data fetchers for the Python engine.

Sources:
  - CoinMetrics Community API: active addresses, tx count (free, no key)
  - Etherscan: gas oracle, ETH whale txs (requires ETHERSCAN_API_KEY env var;
    gracefully returns None if key is absent)

Each fetcher returns a daily DataFrame.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from datetime import datetime, timedelta, timezone

import pandas as pd

_UA = "cogochi-autoresearch/data_cache"
_TIMEOUT = 10


def _get_json(url: str, headers: dict | None = None) -> dict | list:
    h = {"User-Agent": _UA, "Accept": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ─── CoinMetrics Community API (free, no key) ────────────────────────────────

_CM_BASE = "https://community-api.coinmetrics.io/v4"

_CM_ASSET_MAP = {
    "BTCUSDT": "btc",
    "ETHUSDT": "eth",
    "SOLUSDT": "sol",
    "BNBUSDT": "bnb",
    "XRPUSDT": "xrp",
    "ADAUSDT": "ada",
    "DOGEUSDT": "doge",
    "AVAXUSDT": "avax",
    "DOTUSDT": "dot",
    "MATICUSDT": "matic",
}


def _symbol_to_cm_asset(symbol: str) -> str | None:
    """Map a Binance symbol (e.g. 'BTCUSDT') to a CoinMetrics asset id."""
    return _CM_ASSET_MAP.get(symbol.upper())


def fetch_active_addresses(symbol: str, days: int = 365) -> pd.DataFrame | None:
    """Fetch daily active address count from CoinMetrics Community API.

    Returns a daily DataFrame with columns:
        active_addr       — raw count
        active_addr_norm  — normalised 0-1 (relative to 90d max)
    Returns None if the symbol is not in the CoinMetrics asset map.
    """
    asset = _symbol_to_cm_asset(symbol)
    if asset is None:
        return None

    end_dt = datetime.now(tz=timezone.utc).date()
    start_dt = end_dt - timedelta(days=days)

    url = (
        f"{_CM_BASE}/timeseries/asset-metrics"
        f"?assets={asset}&metrics=AdrActCnt"
        f"&start_time={start_dt.isoformat()}"
        f"&end_time={end_dt.isoformat()}"
        f"&page_size=10000"
    )

    try:
        payload = _get_json(url)
    except Exception as e:
        print(f"  [onchain] CoinMetrics active_addr failed for {symbol}: {e}")
        return None

    rows = payload.get("data", []) if isinstance(payload, dict) else []
    records = []
    for row in rows:
        ts = row.get("time")
        val = row.get("AdrActCnt")
        if ts is None or val is None:
            continue
        try:
            records.append({
                "date": pd.Timestamp(ts, tz="UTC").normalize(),
                "active_addr": float(val),
            })
        except Exception:
            continue

    if not records:
        return None

    df = pd.DataFrame(records).set_index("date").sort_index()
    # Normalise relative to rolling 90-day max
    rolling_max = df["active_addr"].rolling(90, min_periods=1).max()
    df["active_addr_norm"] = (df["active_addr"] / rolling_max).clip(0, 1)
    return df[["active_addr", "active_addr_norm"]]


def fetch_tx_count(symbol: str, days: int = 365) -> pd.DataFrame | None:
    """Fetch daily transaction count from CoinMetrics Community API.

    Returns a daily DataFrame with column `tx_count`, or None on failure.
    """
    asset = _symbol_to_cm_asset(symbol)
    if asset is None:
        return None

    end_dt = datetime.now(tz=timezone.utc).date()
    start_dt = end_dt - timedelta(days=days)

    url = (
        f"{_CM_BASE}/timeseries/asset-metrics"
        f"?assets={asset}&metrics=TxCnt"
        f"&start_time={start_dt.isoformat()}"
        f"&end_time={end_dt.isoformat()}"
        f"&page_size=10000"
    )

    try:
        payload = _get_json(url)
    except Exception as e:
        print(f"  [onchain] CoinMetrics tx_count failed for {symbol}: {e}")
        return None

    rows = payload.get("data", []) if isinstance(payload, dict) else []
    records = []
    for row in rows:
        ts = row.get("time")
        val = row.get("TxCnt")
        if ts is None or val is None:
            continue
        try:
            records.append({
                "date": pd.Timestamp(ts, tz="UTC").normalize(),
                "tx_count": float(val),
            })
        except Exception:
            continue

    if not records:
        return None

    return pd.DataFrame(records).set_index("date").sort_index()


# ─── Etherscan (optional — requires ETHERSCAN_API_KEY) ───────────────────────

_ETHERSCAN_BASE = "https://api.etherscan.io/api"


def _etherscan_key() -> str | None:
    return os.environ.get("ETHERSCAN_API_KEY", "").strip() or None


def fetch_eth_gas_current() -> float | None:
    """Fetch current Ethereum gas price (Gwei) from Etherscan.

    Returns None if ETHERSCAN_API_KEY is not set or the request fails.
    This is a SNAPSHOT only — no historical data.
    """
    key = _etherscan_key()
    if not key:
        return None

    url = f"{_ETHERSCAN_BASE}?module=gastracker&action=gasoracle&apikey={key}"
    try:
        payload = _get_json(url)
        propose = payload.get("result", {}).get("ProposeGasPrice")
        return float(propose) if propose else None
    except Exception as e:
        print(f"  [onchain] Etherscan gas failed: {e}")
        return None


def fetch_eth_whale_activity(days: int = 30) -> pd.DataFrame | None:
    """Fetch large ETH transfer count per day from Etherscan.

    Counts transactions > 100 ETH from/to major exchange addresses
    as a proxy for whale activity. Returns None if no API key.

    Returns a daily DataFrame with columns:
        whale_tx_count  — number of large transactions
        whale_norm      — normalised 0-1
    """
    key = _etherscan_key()
    if not key:
        return None

    # Kraken ETH hot wallet as a proxy for exchange flow
    KRAKEN_ETH = "0x2910543af39aba0cd09dbb2d50200b3e800a63d2"
    end_block = 99999999
    url = (
        f"{_ETHERSCAN_BASE}"
        f"?module=account&action=txlist"
        f"&address={KRAKEN_ETH}"
        f"&startblock=0&endblock={end_block}"
        f"&page=1&offset=500&sort=desc"
        f"&apikey={key}"
    )

    try:
        payload = _get_json(url)
        txs = payload.get("result", [])
        if not isinstance(txs, list):
            return None
    except Exception as e:
        print(f"  [onchain] Etherscan whale activity failed: {e}")
        return None

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    daily: dict[datetime, int] = {}

    for tx in txs:
        ts_sec = int(tx.get("timeStamp", 0))
        val_wei = int(tx.get("value", 0))
        val_eth = val_wei / 1e18
        if val_eth < 100:  # threshold: 100 ETH
            continue
        dt = datetime.fromtimestamp(ts_sec, tz=timezone.utc).date()
        ts_day = pd.Timestamp(dt, tz="UTC")
        if ts_day < pd.Timestamp(cutoff):
            continue
        daily[ts_day] = daily.get(ts_day, 0) + 1

    if not daily:
        return None

    df = pd.DataFrame(
        [{"date": k, "whale_tx_count": v} for k, v in daily.items()]
    ).set_index("date").sort_index()

    rolling_max = df["whale_tx_count"].rolling(14, min_periods=1).max()
    df["whale_norm"] = (df["whale_tx_count"] / rolling_max).clip(0, 1).fillna(0.5)
    return df
