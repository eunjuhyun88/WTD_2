"""Multi-exchange Open Interest aggregator.

Pulls hourly OI from Binance, Bybit, and OKX and merges into a single
per-symbol DataFrame. Gives total perp OI across venues and per-exchange
breakdown — enabling divergence signals (one exchange spiking alone =
potential manipulation) and institutional-proxy metrics.

CME OI is not available via free public API; placeholder column is zero-filled
until Coinglass integration is added.

Exchange endpoints (all public / free-tier):
  Binance  : /futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=500
  Bybit    : /v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=1h&limit=200
  OKX      : /api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP
             (requires OKX_API_KEY env var; skipped gracefully if absent)

Symbol convention: Binance-style (BTCUSDT, ETHUSDT, SOLUSDT, etc.)
OKX uses BTC-USDT-SWAP format — converted automatically.

Returns per-symbol daily-ish DataFrame indexed at 1h UTC frequency.
Scope: per_symbol (registered in registry.py).
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
from datetime import datetime, timezone

import pandas as pd

log = logging.getLogger("engine.data_cache.exchange_oi")

_UA = "cogochi-autoresearch/data_cache"
_TIMEOUT = 15

_BINANCE_FUTURES = "https://fapi.binance.com"
_BYBIT = "https://api.bybit.com"
_OKX = "https://www.okx.com"


def _get_json(url: str, headers: dict | None = None) -> dict | list | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": _UA, "Accept": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        log.debug("fetch failed [%s]: %s", url[:80], exc)
        return None


# ── Binance ──────────────────────────────────────────────────────────────────

def _fetch_binance_oi(symbol: str, limit: int = 500) -> pd.Series | None:
    """Binance USDT-M perp OI history. Returns Series indexed by UTC datetime."""
    url = (
        f"{_BINANCE_FUTURES}/futures/data/openInterestHist"
        f"?symbol={symbol}&period=1h&limit={limit}"
    )
    data = _get_json(url)
    if not data or not isinstance(data, list):
        return None

    rows = []
    for r in data:
        if "timestamp" not in r:
            continue
        ts = pd.Timestamp(int(r["timestamp"]), unit="ms", tz="UTC")
        # sumOpenInterestValue is USD notional; fall back to contract count only if absent
        oi_usd = float(r.get("sumOpenInterestValue") or r.get("sumOpenInterest", 0))
        rows.append({"ts": ts, "binance_oi": oi_usd})

    if not rows:
        return None

    df = pd.DataFrame(rows).set_index("ts").sort_index()
    df = df[~df.index.duplicated(keep="last")]
    return df["binance_oi"]


# ── Bybit ─────────────────────────────────────────────────────────────────────

def _fetch_bybit_price(symbol: str) -> float:
    """Fetch latest Bybit mark price for USD conversion."""
    url = f"{_BYBIT}/v5/market/tickers?category=linear&symbol={symbol}"
    data = _get_json(url)
    try:
        return float(data["result"]["list"][0]["lastPrice"])
    except Exception:
        return 0.0


def _fetch_bybit_oi(symbol: str, limit: int = 200) -> pd.Series | None:
    """Bybit linear perp OI history (converted to USD notional)."""
    url = (
        f"{_BYBIT}/v5/market/open-interest"
        f"?category=linear&symbol={symbol}&intervalTime=1h&limit={limit}"
    )
    data = _get_json(url)
    if not data or not isinstance(data, dict):
        return None

    result = data.get("result", {})
    items = result.get("list", [])
    if not items:
        return None

    # Bybit returns OI in base currency (BTC for BTCUSDT) — convert to USD
    price = _fetch_bybit_price(symbol)
    if price <= 0:
        return None

    rows = []
    for r in items:
        ts = pd.Timestamp(int(r["timestamp"]), unit="ms", tz="UTC")
        oi_usd = float(r["openInterest"]) * price
        rows.append({"ts": ts, "bybit_oi": oi_usd})

    df = pd.DataFrame(rows).set_index("ts").sort_index()
    df = df[~df.index.duplicated(keep="last")]
    return df["bybit_oi"]


# ── OKX ───────────────────────────────────────────────────────────────────────

def _binance_to_okx_instid(symbol: str) -> str:
    """Convert BTCUSDT → BTC-USDT-SWAP."""
    if symbol.endswith("USDT"):
        base = symbol[:-4]
        return f"{base}-USDT-SWAP"
    return ""


def _fetch_okx_oi(symbol: str) -> pd.Series | None:
    """OKX USDT swap OI (current snapshot only — no public history endpoint)."""
    inst_id = _binance_to_okx_instid(symbol)
    if not inst_id:
        return None

    api_key = os.environ.get("OKX_API_KEY", "")
    headers = {"OK-ACCESS-KEY": api_key} if api_key else {}

    url = f"{_OKX}/api/v5/public/open-interest?instType=SWAP&instId={inst_id}"
    data = _get_json(url, headers)
    if not data or not isinstance(data, dict):
        return None
    if data.get("code") not in ("0", 0):
        return None

    items = data.get("data", [])
    if not items:
        return None

    rows = []
    for r in items:
        ts = pd.Timestamp(int(r["ts"]), unit="ms", tz="UTC")
        # oiCcy = OI in base currency, oiUsd = USD notional
        oi_usd = float(r.get("oiUsd", 0) or r.get("oi", 0))
        rows.append({"ts": ts, "okx_oi": oi_usd})

    if not rows:
        return None
    df = pd.DataFrame(rows).set_index("ts").sort_index()
    return df["okx_oi"]


# ── Merge ─────────────────────────────────────────────────────────────────────

def fetch_exchange_oi(symbol: str, days: int = 30) -> pd.DataFrame | None:
    """Fetch and merge OI from Binance + Bybit + OKX.

    Returns hourly DataFrame with columns:
        binance_oi          — Binance USDT-M perp OI (USD notional)
        bybit_oi            — Bybit linear perp OI (USD notional)
        okx_oi              — OKX USDT swap OI (latest snapshot, broadcast)
        total_perp_oi       — sum of above three
        oi_exchange_conc    — max_exchange / total (concentration, 1=monopoly)
        total_oi_change_1h  — pct change of total_perp_oi vs 1 bar ago
        total_oi_change_24h — pct change vs 24 bars ago
        cme_oi              — zero-filled (placeholder for future Coinglass)

    Returns None only if ALL sources fail.
    """
    limit = min(days * 24, 500)

    binance = _fetch_binance_oi(symbol, limit=limit)
    bybit = _fetch_bybit_oi(symbol, limit=min(limit, 200))
    okx_snap = _fetch_okx_oi(symbol)

    if binance is None and bybit is None:
        log.warning("exchange_oi: all sources failed for %s", symbol)
        return None

    # Align on common hourly index
    frames: list[pd.Series] = []
    if binance is not None:
        frames.append(binance.rename("binance_oi"))
    if bybit is not None:
        frames.append(bybit.rename("bybit_oi"))

    df = pd.concat(frames, axis=1, sort=True).sort_index()

    # Fill missing exchange columns with 0
    for col in ("binance_oi", "bybit_oi", "okx_oi"):
        if col not in df.columns:
            df[col] = 0.0

    # OKX: only snapshot — broadcast to all rows as approximation.
    # Warn if snapshot is stale (>4h) — data may be misleading.
    if okx_snap is not None and not okx_snap.empty:
        snap_age_h = (pd.Timestamp.now(tz="UTC") - okx_snap.index[-1]).total_seconds() / 3600
        if snap_age_h > 4:
            log.debug("OKX OI snapshot for %s is %.1fh stale — broadcasting anyway", symbol, snap_age_h)
        df["okx_oi"] = float(okx_snap.iloc[-1])

    df = df.fillna(0.0)

    df["total_perp_oi"] = df["binance_oi"] + df["bybit_oi"] + df["okx_oi"]

    # Concentration: dominant exchange share
    exchange_cols = [c for c in ["binance_oi", "bybit_oi", "okx_oi"] if df[c].sum() > 0]
    if exchange_cols and df["total_perp_oi"].gt(0).any():
        df["oi_exchange_conc"] = df[exchange_cols].max(axis=1) / df["total_perp_oi"].replace(0, float("nan"))
        df["oi_exchange_conc"] = df["oi_exchange_conc"].fillna(1.0)
    else:
        df["oi_exchange_conc"] = 1.0

    df["total_oi_change_1h"] = df["total_perp_oi"].pct_change(1).fillna(0.0)
    df["total_oi_change_24h"] = df["total_perp_oi"].pct_change(24).fillna(0.0)
    df["cme_oi"] = 0.0  # placeholder

    # Trim to requested days
    cutoff = pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=days)
    df = df[df.index >= cutoff]

    return df[[
        "binance_oi", "bybit_oi", "okx_oi",
        "total_perp_oi", "oi_exchange_conc",
        "total_oi_change_1h", "total_oi_change_24h",
        "cme_oi",
    ]]
