"""W-0292 D-D — BTC ETF daily fund inflow/outflow tracking.

Primary source: Farside Investors (farside.co.uk/bitcoin-etf-flow/)
Fallback: static empty data (API integration deferred to Phase 2)
"""
from __future__ import annotations
import logging
from dataclasses import dataclass
from datetime import date

import pandas as pd

logger = logging.getLogger(__name__)

# Known BTC ETF ticker → issuer
BTC_ETF_ISSUERS: dict[str, str] = {
    "IBIT": "BlackRock",
    "FBTC": "Fidelity",
    "GBTC": "Grayscale",
    "ARKB": "ARK/21Shares",
    "BITB": "Bitwise",
    "HODL": "VanEck",
    "BRRR": "Valkyrie",
    "EZBC": "Franklin",
    "BTCO": "Invesco",
}


@dataclass
class ETFFlowRecord:
    date: date
    ticker: str
    issuer: str
    flow_usd_millions: float | None   # positive = inflow, negative = outflow, None = no data
    aum_usd_millions: float | None


def fetch_btc_etf_flow_static(
    since: date | None = None,
) -> list[ETFFlowRecord]:
    """Return static placeholder data (Farside API integration pending Phase 2).

    Currently returns an empty list. Structure is defined here so callers
    are already wired to the correct interface before Phase 2 lands.
    """
    logger.info("ETF flow fetcher: static mode (Farside integration pending Phase 2)")
    return []


def fetch_btc_etf_flow_aggregate(
    since: date | None = None,
) -> pd.DataFrame:
    """Aggregate BTC ETF daily inflows/outflows across all ETFs.

    Returns DataFrame with columns:
        date, total_flow_usd_millions, n_etfs_reporting
    """
    records = fetch_btc_etf_flow_static(since=since)

    if not records:
        return pd.DataFrame(columns=["date", "total_flow_usd_millions", "n_etfs_reporting"])

    df = pd.DataFrame([
        {
            "date": r.date,
            "flow": r.flow_usd_millions or 0.0,
        }
        for r in records
        if r.flow_usd_millions is not None
    ])

    if df.empty:
        return pd.DataFrame(columns=["date", "total_flow_usd_millions", "n_etfs_reporting"])

    result = df.groupby("date").agg(
        total_flow_usd_millions=("flow", "sum"),
        n_etfs_reporting=("flow", "count"),
    ).reset_index()
    return result


def get_etf_flow_7d_usd(as_of: date | None = None) -> float | None:
    """Sum of BTC ETF inflows/outflows over the last 7 days (USD millions).

    Returns None when no data is available — feature_calc should fall back
    to a neutral default rather than raising.
    """
    df = fetch_btc_etf_flow_aggregate()
    if df.empty:
        return None
    recent = df.tail(7)
    if recent.empty:
        return None
    return float(recent["total_flow_usd_millions"].sum())
