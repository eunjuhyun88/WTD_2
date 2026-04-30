"""Sector momentum fetcher — W-0328.

Fetches Binance USDT perp 24h tickers and computes per-sector average
price changes. Used to populate sector_score_norm feature.

Alpha Hunter S12/L12 formula:
    sector_avg = mean(pct_change_24h) per sector
    sector_score_norm = zscore of symbol vs its sector peers
    sector_momentum_strong: sector_avg > +20% (Alpha Hunter S12 threshold)

Cache: 60 seconds (sector momentum is a slow-moving signal)
"""
from __future__ import annotations

import logging
import time
from typing import Optional

import requests

from data_cache.token_universe import SECTOR_MAP, get_sector

log = logging.getLogger("engine.data_cache.fetch_sector_momentum")

_PERP_TICKER_URL = "https://fapi.binance.com/fapi/v1/ticker/24hr"
_TTL = 60.0


_cache: dict[str, tuple[dict[str, float], float]] = {}  # 'sectors' → (map, expiry)


def fetch_sector_scores(
    *,
    timeout: float = 8.0,
) -> Optional[dict[str, float]]:
    """Return dict[symbol → sector_score_norm] for all USDT perp symbols.

    sector_score_norm is z-score of each symbol's 24h pct change relative
    to its sector peers. Returns None on network error.
    """
    now = time.monotonic()
    if "sectors" in _cache:
        scores, exp = _cache["sectors"]
        if now < exp:
            return scores

    try:
        r = requests.get(_PERP_TICKER_URL, timeout=timeout)
        r.raise_for_status()
        tickers = r.json()
    except Exception as exc:
        log.debug("Sector momentum fetch failed: %s", exc)
        return None

    # Build symbol → pct_change mapping
    sym_pct: dict[str, float] = {}
    for t in tickers:
        sym = t.get("symbol", "")
        if not sym.endswith("USDT"):
            continue
        try:
            pct = float(t.get("priceChangePercent", 0))
            sym_pct[sym] = pct
        except (ValueError, TypeError):
            pass

    # Group by sector
    sector_members: dict[str, list[float]] = {}
    for sym, pct in sym_pct.items():
        sector = get_sector(sym)
        sector_members.setdefault(sector, []).append(pct)

    # Compute sector avg and std
    import statistics
    sector_avg: dict[str, float] = {}
    sector_std: dict[str, float] = {}
    for sector, pcts in sector_members.items():
        sector_avg[sector] = statistics.mean(pcts)
        sector_std[sector] = statistics.stdev(pcts) if len(pcts) > 1 else 1.0

    # Compute z-scores per symbol
    scores: dict[str, float] = {}
    for sym, pct in sym_pct.items():
        sector = get_sector(sym)
        avg = sector_avg.get(sector, 0.0)
        std = max(sector_std.get(sector, 1.0), 0.01)
        scores[sym] = (pct - avg) / std

    # Also store raw sector_avg for the sector_momentum_strong block
    scores["__sector_avg__"] = sector_avg  # type: ignore[assignment]

    _cache["sectors"] = (scores, now + _TTL)
    return scores
