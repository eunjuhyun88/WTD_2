"""On-chain data fetchers for the Python engine.

Sources:
  - CoinMetrics Community API: active addresses, tx count, MVRV Z-score,
    Puell Multiple (free, no key required)
  - Etherscan: gas oracle, ETH whale txs (requires ETHERSCAN_API_KEY env var;
    gracefully returns None if key is absent)

Each fetcher returns a daily DataFrame indexed by UTC date.

CoinMetrics Community API metrics used:
  AdrActCnt   — active address count
  TxCnt       — transaction count
  CapMrktCurUSD — market cap (USD)
  CapRealUSD  — realised cap (USD) → MVRV ratio
  IssTotUSD   — total daily issuance (USD) → Puell Multiple
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    import env_bootstrap  # noqa: F401
except ModuleNotFoundError:
    from engine import env_bootstrap  # type: ignore  # noqa: F401

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


def _fetch_cm_metrics(
    symbol: str, metrics: list[str], days: int
) -> pd.DataFrame | None:
    """Generic CoinMetrics time-series fetch for one asset, multiple metrics.

    Returns a daily DataFrame indexed by UTC date, columns = metric names.
    Returns None on any failure or if the symbol has no CoinMetrics mapping.
    """
    asset = _symbol_to_cm_asset(symbol)
    if asset is None:
        return None

    end_dt = datetime.now(tz=timezone.utc).date()
    start_dt = end_dt - timedelta(days=days)
    metrics_str = ",".join(metrics)

    url = (
        f"{_CM_BASE}/timeseries/asset-metrics"
        f"?assets={asset}&metrics={metrics_str}"
        f"&start_time={start_dt.isoformat()}"
        f"&end_time={end_dt.isoformat()}"
        f"&page_size=10000"
    )

    try:
        payload = _get_json(url)
    except Exception as e:
        print(f"  [onchain] CoinMetrics {metrics_str} failed for {symbol}: {e}")
        return None

    rows = payload.get("data", []) if isinstance(payload, dict) else []
    records = []
    for row in rows:
        ts = row.get("time")
        if ts is None:
            continue
        rec: dict = {"date": pd.Timestamp(ts, tz="UTC").normalize()}
        for m in metrics:
            v = row.get(m)
            if v is not None:
                try:
                    rec[m] = float(v)
                except (TypeError, ValueError):
                    pass
        if len(rec) > 1:  # at least one metric present
            records.append(rec)

    if not records:
        return None

    df = pd.DataFrame(records).set_index("date").sort_index()
    # Ensure all requested metric columns exist (fill with NaN if absent)
    for m in metrics:
        if m not in df.columns:
            df[m] = float("nan")
    return df


def fetch_mvrv_zscore(symbol: str, days: int = 730) -> pd.DataFrame | None:
    """Fetch MVRV Z-score from CoinMetrics Community API.

    MVRV ratio = CapMrktCurUSD / CapRealUSD
    MVRV Z-score = (MVRV − 2yr_rolling_mean) / 2yr_rolling_std

    Returns a daily DataFrame with columns:
        mvrv         — raw MVRV ratio (> 3.5 = overvalued, < 1 = undervalued)
        mvrv_zscore  — Z-score, typically ranges −2 to +7 for BTC
    Returns None if the symbol is unsupported or the request fails.
    """
    df = _fetch_cm_metrics(symbol, ["CapMrktCurUSD", "CapRealUSD"], days=days)
    if df is None:
        return None

    # Drop rows where either cap is NaN or zero
    df = df.dropna(subset=["CapMrktCurUSD", "CapRealUSD"])
    df = df[(df["CapMrktCurUSD"] > 0) & (df["CapRealUSD"] > 0)]
    if df.empty:
        return None

    df["mvrv"] = df["CapMrktCurUSD"] / df["CapRealUSD"]

    # Rolling 2-year (730 trading days) Z-score — past-only, no look-ahead
    window = min(730, len(df))
    rolling_mean = df["mvrv"].rolling(window, min_periods=max(30, window // 4)).mean()
    rolling_std = df["mvrv"].rolling(window, min_periods=max(30, window // 4)).std(ddof=0)
    df["mvrv_zscore"] = (
        (df["mvrv"] - rolling_mean) / rolling_std.replace(0, float("nan"))
    ).fillna(0.0).clip(-4.0, 10.0)

    return df[["mvrv", "mvrv_zscore"]]


def fetch_puell_multiple(symbol: str, days: int = 730) -> pd.DataFrame | None:
    """Fetch Puell Multiple from CoinMetrics Community API.

    Puell Multiple = daily_issuance_USD / rolling_365d_mean(daily_issuance_USD)

    Originally BTC-specific (miner revenue / 1yr avg), but generalised here
    to any asset with CoinMetrics `IssTotUSD` coverage.

    Returns a daily DataFrame with column:
        puell_multiple  — ratio; > 4 = historically overheated, < 0.5 = undervalued
    Returns None if the symbol is unsupported or the request fails.
    """
    df = _fetch_cm_metrics(symbol, ["IssTotUSD"], days=days)
    if df is None:
        return None

    df = df.dropna(subset=["IssTotUSD"])
    df = df[df["IssTotUSD"] > 0]
    if df.empty:
        return None

    rolling_365 = df["IssTotUSD"].rolling(365, min_periods=30).mean()
    df["puell_multiple"] = (
        df["IssTotUSD"] / rolling_365.replace(0, float("nan"))
    ).fillna(1.0).clip(0.0, 20.0)

    return df[["puell_multiple"]]


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
