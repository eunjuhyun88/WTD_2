"""COT (Commitments of Traders) data fetcher and parser.

Fetches weekly COT reports from CFTC, caches locally, maps to symbols.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests

log = logging.getLogger(__name__)

# Cache directory
CACHE_DIR = Path(__file__).parent.parent / "data_cache" / "cot"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# CFTC COT API endpoints
CFTC_COT_REPORTS = "https://www.cftc.gov/dea/newcot/dea_oi_symbol.csv"
# Backup: JSON endpoint with more detail
CFTC_COT_JSON = "https://publicdata.cftc.gov/api/ad/openinterest"

# Symbol mapping: CFTC report names to crypto symbols
CFTC_TO_SYMBOL = {
    "BTC": "BTCUSDT",
    "BITCOIN": "BTCUSDT",
    "BITCOIN FUTURES": "BTCUSDT",
    "ETH": "ETHUSDT",
    "ETHEREUM": "ETHUSDT",
    "ETHEREUM FUTURES": "ETHUSDT",
}

# COT report structure (column names vary; normalize here)
COT_COLUMNS = {
    "large_spec_long": "large_speculative_long",
    "large_spec_short": "large_speculative_short",
    "commercial_long": "commercial_long",
    "commercial_short": "commercial_short",
    "oi_total": "open_interest_total",
    "report_date": "report_date",
}


def fetch_cot_report(symbol: str, week_ago: int = 0) -> Optional[dict]:
    """Fetch COT report for a symbol.

    Args:
        symbol: e.g. 'BTCUSDT', 'ETHUSDT'
        week_ago: 0 = latest (with 2-day lag), 1 = previous week, etc.

    Returns:
        Dict with keys: large_spec_long/short, commercial_long/short, oi_total, report_date
    """
    # Check cache first
    cache_key = f"{symbol}_{week_ago}"
    cached = _load_cache(cache_key)
    if cached:
        return cached

    try:
        # Attempt to fetch from CFTC CSV
        data = _fetch_from_cftc_csv(symbol, week_ago)
        if data:
            _save_cache(cache_key, data)
            return data
    except Exception as e:
        log.warning(f"Failed to fetch COT for {symbol}: {e}")

    return None


def _fetch_from_cftc_csv(symbol: str, week_ago: int) -> Optional[dict]:
    """Fetch from CFTC CSV endpoint."""
    try:
        response = requests.get(CFTC_COT_REPORTS, timeout=10)
        response.raise_for_status()

        # Parse CSV (basic parsing; would use pandas in production)
        lines = response.text.strip().split("\n")
        if not lines or len(lines) < 2:
            return None

        headers = lines[0].lower().split(",")

        # Find symbol row
        cftc_name = _normalize_cftc_symbol(symbol)
        for line in lines[1:]:
            fields = [f.strip() for f in line.split(",")]
            if len(fields) < len(headers):
                continue

            row_dict = dict(zip(headers, fields))
            if cftc_name.lower() in row_dict.get("commodity", "").lower():
                return _parse_cot_row(row_dict)

    except Exception as e:
        log.error(f"CFTC CSV fetch failed: {e}")

    return None


def _normalize_cftc_symbol(symbol: str) -> str:
    """Map WTD symbol to CFTC report name."""
    return CFTC_TO_SYMBOL.get(symbol.upper(), symbol)


def _parse_cot_row(row: dict) -> dict:
    """Parse COT row into normalized format."""
    try:
        return {
            "large_spec_long": int(row.get("large_speculators_long", 0)),
            "large_spec_short": int(row.get("large_speculators_short", 0)),
            "commercial_long": int(row.get("commercial_long", 0)),
            "commercial_short": int(row.get("commercial_short", 0)),
            "oi_total": int(row.get("open_interest_total", 0)),
            "report_date": row.get("report_date", ""),
        }
    except ValueError as e:
        log.error(f"Failed to parse COT row: {e}")
        return None


def _load_cache(cache_key: str) -> Optional[dict]:
    """Load cached COT report."""
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists():
        try:
            with open(cache_file) as f:
                return json.load(f)
        except Exception as e:
            log.warning(f"Cache load failed for {cache_key}: {e}")
    return None


def _save_cache(cache_key: str, data: dict) -> None:
    """Save COT report to cache."""
    try:
        cache_file = CACHE_DIR / f"{cache_key}.json"
        with open(cache_file, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log.error(f"Cache save failed for {cache_key}: {e}")


def cot_large_spec_short_pct(symbol: str) -> Optional[float]:
    """Compute large speculator short positioning as % of OI.

    Returns:
        Percentage 0–100, or None if data unavailable.
    """
    data = fetch_cot_report(symbol)
    if not data or data["oi_total"] == 0:
        return None
    return (data["large_spec_short"] / data["oi_total"]) * 100


def cot_commercial_net_pct(symbol: str) -> Optional[float]:
    """Compute commercial net positioning as % of OI.

    Returns:
        Percentage -100 to +100 (negative=net short, positive=net long), or None.
    """
    data = fetch_cot_report(symbol)
    if not data or data["oi_total"] == 0:
        return None
    net = data["commercial_long"] - data["commercial_short"]
    return (net / data["oi_total"]) * 100


if __name__ == "__main__":
    # Test fetch
    for sym in ["BTCUSDT", "ETHUSDT"]:
        print(f"\nFetching COT for {sym}...")
        data = fetch_cot_report(sym)
        if data:
            print(f"  Large spec short: {data['large_spec_short']}")
            print(f"  Commercial long: {data['commercial_long']}")
            print(f"  OI total: {data['oi_total']}")
        else:
            print(f"  No data available")
