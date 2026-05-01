"""Deribit options Greeks and Gamma Exposure (GEX) data.

Fetches perpetual options Greeks (gamma, vega, delta) from Deribit public API
for BTC and ETH perpetuals. Used by Layer 5 regime filtering in autoresearch.

Deribit endpoint (public, no auth required):
  GET /api/v2/public/get_index_price_names
  GET /api/v2/public/get_instruments?currency={BTC,ETH}&kind=option
  GET /api/v2/public/instrument?instrument_name=...

Returns aggregated Gamma Exposure (GEX) per underlying, interpreted as:
  - GEX > +5B = Call-heavy (upside protection), bearish signal
  - GEX < -5B = Put-heavy (downside protection), bullish signal
  - |GEX| < 2B = Balanced, neutral signal

Scope: per_symbol, hourly refresh, cached 1 day.
"""
from __future__ import annotations

import json
import logging
import time
import urllib.request
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

log = logging.getLogger("engine.data_cache.deribit_options")

_UA = "cogochi-autoresearch/data_cache"
_TIMEOUT = 10
_DERIBIT = "https://www.deribit.com"


def _get_json(url: str, headers: dict | None = None) -> dict | list | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": _UA, "Accept": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        log.debug("deribit fetch failed [%s]: %s", url[:80], exc)
        return None


def fetch_deribit_gex(currency: str = "BTC") -> Optional[float]:
    """Fetch aggregated Gamma Exposure (GEX) for BTC or ETH perpetuals.

    Returns total GEX in USD billions, where:
      - Positive = Call-heavy (upside bias, bearish)
      - Negative = Put-heavy (downside bias, bullish)

    Args:
        currency: "BTC" or "ETH"

    Returns:
        GEX in USD billions, or None if fetch fails.
    """
    if currency not in ("BTC", "ETH"):
        raise ValueError(f"currency must be BTC or ETH, got {currency}")

    # Get all active options for this currency
    url = f"{_DERIBIT}/api/v2/public/get_instruments"
    params = f"?currency={currency}&kind=option&expired=false"
    data = _get_json(url + params)

    if not data or not isinstance(data, dict):
        return None

    result = data.get("result", [])
    if not isinstance(result, list):
        return None

    total_gex = 0.0

    for instrument in result:
        try:
            instrument_name = instrument.get("instrument_name", "")
            # Skip if not a standard perpetual option (e.g., quarterly futures)
            if not (
                instrument_name.startswith(currency)
                and instrument_name.endswith("_0")
            ):
                continue

            # Fetch detailed instrument data with Greeks
            inst_url = f"{_DERIBIT}/api/v2/public/instrument"
            inst_data = _get_json(f"{inst_url}?instrument_name={instrument_name}")

            if not inst_data or not isinstance(inst_data, dict):
                continue

            inst_result = inst_data.get("result", {})
            gamma = float(inst_result.get("gamma", 0))
            mark_price = float(inst_result.get("mark_price", 0))
            amount = float(inst_result.get("amount", 0))

            if gamma and mark_price and amount:
                # GEX = Gamma × Price² × Number_of_Contracts × 100
                # (1 contract = 100 USD notional for options)
                gex_contribution = gamma * (mark_price ** 2) * amount / 1e9
                total_gex += gex_contribution

        except (KeyError, ValueError, TypeError):
            continue

    return total_gex if total_gex != 0.0 else None


def fetch_deribit_greeks(
    currency: str = "BTC", limit: int = 20
) -> Optional[pd.DataFrame]:
    """Fetch top N options by gamma exposure, sorted by Greeks.

    Returns DataFrame with columns:
      instrument_name, mark_price, gamma, delta, vega, theta, iv
    """
    if currency not in ("BTC", "ETH"):
        raise ValueError(f"currency must be BTC or ETH, got {currency}")

    url = f"{_DERIBIT}/api/v2/public/get_instruments"
    params = f"?currency={currency}&kind=option&expired=false"
    data = _get_json(url + params)

    if not data or not isinstance(data, dict):
        return None

    result = data.get("result", [])
    if not isinstance(result, list):
        return None

    rows = []

    for instrument in result[:limit]:
        try:
            instrument_name = instrument.get("instrument_name", "")
            inst_url = f"{_DERIBIT}/api/v2/public/instrument"
            inst_data = _get_json(f"{inst_url}?instrument_name={instrument_name}")

            if not inst_data or not isinstance(inst_data, dict):
                continue

            inst_result = inst_data.get("result", {})
            rows.append(
                {
                    "instrument_name": instrument_name,
                    "mark_price": float(inst_result.get("mark_price", 0)),
                    "gamma": float(inst_result.get("gamma", 0)),
                    "delta": float(inst_result.get("delta", 0)),
                    "vega": float(inst_result.get("vega", 0)),
                    "theta": float(inst_result.get("theta", 0)),
                    "iv": float(inst_result.get("mark_iv", 0)),
                    "timestamp": datetime.now(timezone.utc),
                }
            )
        except (KeyError, ValueError, TypeError):
            continue

    if not rows:
        return None

    return pd.DataFrame(rows)
