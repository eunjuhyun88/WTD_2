"""Coinalyze liquidation-history fetcher for public market-wide windows."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import pandas as pd

from data_cache.coinalyze_credentials import resolve_coinalyze_api_key

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


def empty_liquidation_history_frame() -> pd.DataFrame:
    return pd.DataFrame(columns=["long_liq_usd", "short_liq_usd"])


def fetch_coinalyze_liquidation_history(
    symbol: str,
    *,
    timeframe: str = "1h",
    limit: int = 100,
    end_time: datetime | None = None,
) -> pd.DataFrame:
    interval = _coinalyze_interval(timeframe)
    now = int((end_time or datetime.now(timezone.utc)).timestamp())
    from_ts = now - _INTERVAL_SECONDS[interval] * max(1, limit)
    rows = _fetch_json(
        "liquidation-history",
        {
            "symbols": _coinalyze_symbol(symbol),
            "interval": interval,
            "from": str(from_ts),
            "to": str(now),
        },
    )
    if not rows or not isinstance(rows[0], dict) or not isinstance(rows[0].get("history"), list):
        return empty_liquidation_history_frame()

    history_rows: list[dict[str, object]] = []
    for point in rows[0]["history"]:
        if not isinstance(point, dict):
            continue
        timestamp = point.get("t")
        if timestamp in (None, ""):
            continue
        history_rows.append(
            {
                "timestamp": pd.to_datetime(int(timestamp), unit="s", utc=True),
                "long_liq_usd": float(point.get("l") or 0.0),
                "short_liq_usd": float(point.get("s") or 0.0),
            }
        )
    if not history_rows:
        return empty_liquidation_history_frame()

    frame = pd.DataFrame(history_rows).drop_duplicates(subset=["timestamp"], keep="last")
    return frame.set_index("timestamp").sort_index()[["long_liq_usd", "short_liq_usd"]]
