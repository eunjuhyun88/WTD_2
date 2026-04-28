"""W-0292 D-G — DEX efficiency indicators: Volume/TVL Ratio and Fee Revenue Ratio."""
from __future__ import annotations
import logging

logger = logging.getLogger(__name__)


def calc_volume_tvl_ratio(
    dex_volume_usd_24h: float | None,
    tvl_usd: float | None,
) -> float | None:
    """DEX 24h Volume / TVL. DEX efficiency measurement indicator.

    Returns None if either input is None or TVL is 0 (avoid division by zero).
    Typical range: 0.01~5.0 (>1.0 = very active).
    """
    if dex_volume_usd_24h is None or tvl_usd is None or tvl_usd <= 0:
        return None
    return dex_volume_usd_24h / tvl_usd


def calc_fee_revenue_ratio(
    fees_usd_24h: float | None,
    volume_usd_24h: float | None,
) -> float | None:
    """24h fees / 24h volume = fee rate (protocol profitability).

    Returns None if either input is None or volume is 0 (avoid division by zero).
    """
    if fees_usd_24h is None or volume_usd_24h is None or volume_usd_24h <= 0:
        return None
    return fees_usd_24h / volume_usd_24h
