"""Binance Alpha Universe tracker.

Tracks which tokens are:
1. Listed on Binance Alpha (the pre-listing discovery platform)
2. Cross-listed on Binance Futures (the pump trigger event)
3. Community takeovers / boosted on DexScreener (pump preparation signals)

Strategy context:
  BSC tokens appearing on Binance Alpha that subsequently get Binance Futures
  listings have shown repeated 10-30x pump patterns (MYX, AIOT, SKYAI, PUMPBTC,
  XPIN, RIVER, SIREN, RAVE, etc.). The gap between Alpha listing and Futures
  listing is the accumulation window.

Universe management:
  - ALPHA_WATCHLIST: manually curated seed (updated by user)
  - Auto-discovery via DexScreener profiles + community takeovers
  - Futures listing check via Binance FAPI exchangeInfo
  - Output: which symbols to actively monitor for entry signals

No API key required. Uses:
  Binance FAPI (public): fapi.binance.com/fapi/v1/exchangeInfo
  DexScreener (public): token-profiles, community-takeovers, token-boosts
"""
from __future__ import annotations

import json
import logging
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

log = logging.getLogger("engine.data_cache.alpha_universe")

_UA = "cogochi-autoresearch/alpha-universe"
_TIMEOUT = 15
_BINANCE_FAPI = "https://fapi.binance.com"

# ── Manual watchlist (A/B grade tokens from user analysis 2026-04-21) ─────────
# Format: BASE_SYMBOL (without USDT suffix)
ALPHA_WATCHLIST: dict[str, dict] = {
    # A-grade: 10x+ potential
    "UB":     {"grade": "A", "chain": "bsc", "note": ""},
    "NIGHT":  {"grade": "A", "chain": "bsc", "note": ""},
    "IN":     {"grade": "A", "chain": "ethereum", "note": "Infinit Labs, vesting unlock 2026-05-07"},
    "IRYS":   {"grade": "A", "chain": "ethereum", "note": ""},
    "JCT":    {"grade": "A", "chain": "bsc", "note": "Bitget listed"},
    "NAORIS": {"grade": "A", "chain": "bsc", "note": ""},
    "KGEN":   {"grade": "A", "chain": "bsc", "note": ""},
    "FLUID":  {"grade": "A", "chain": "ethereum", "note": ""},
    "ON":     {"grade": "A", "chain": "bsc", "note": ""},
    "ACU":    {"grade": "A", "chain": "bsc", "note": ""},
    "BLUAI":  {"grade": "A", "chain": "bsc", "note": ""},
    "AIO":    {"grade": "A", "chain": "bsc", "note": ""},
    "BOB":    {"grade": "A", "chain": "bsc", "note": ""},
    "VELVET": {"grade": "A", "chain": "bsc", "note": ""},
    "AIN":    {"grade": "A", "chain": "bsc", "note": ""},
    "CARV":   {"grade": "A", "chain": "ethereum", "note": ""},
    "US":     {"grade": "A", "chain": "bsc", "note": ""},
    "DAM":    {"grade": "A", "chain": "bsc", "note": ""},
    "IR":     {"grade": "A", "chain": "bsc", "note": ""},
    "SQD":    {"grade": "A", "chain": "ethereum", "note": "Subsquid"},
    # B-grade: 2-5x potential
    "CYS":    {"grade": "B", "chain": "bsc", "note": ""},
    "BEAT":   {"grade": "B", "chain": "bsc", "note": ""},
    "COAI":   {"grade": "B", "chain": "bsc", "note": ""},
    "TAIKO":  {"grade": "B", "chain": "ethereum", "note": ""},
    "BSB":    {"grade": "B", "chain": "bsc", "note": ""},
    "ICNT":   {"grade": "B", "chain": "bsc", "note": ""},
    "APR":    {"grade": "B", "chain": "bsc", "note": ""},
    "SAFE":   {"grade": "B", "chain": "bsc", "note": ""},
    "XAN":    {"grade": "B", "chain": "bsc", "note": ""},
    "ZETA":   {"grade": "B", "chain": "bsc", "note": ""},
    "CLO":    {"grade": "B", "chain": "bsc", "note": ""},
    "LIGHT":  {"grade": "B", "chain": "bsc", "note": ""},
    "RECALL": {"grade": "B", "chain": "bsc", "note": ""},
    "PROMPT": {"grade": "B", "chain": "bsc", "note": ""},
    "COLLECT":{"grade": "B", "chain": "bsc", "note": ""},
    "PTB":    {"grade": "B", "chain": "bsc", "note": "delist risk"},
    "FIGHT":  {"grade": "B", "chain": "bsc", "note": ""},
}


@dataclass
class AlphaToken:
    """Enriched token record combining watchlist + live discovery data."""
    symbol: str                          # Binance-style: INUSDT
    base: str                            # IN
    grade: str = "B"                     # A / B / discovered
    chain: str = "bsc"
    note: str = ""
    futures_listed: bool = False         # on Binance Futures?
    futures_listed_at: datetime | None = None
    dex_address: str = ""
    boosted: bool = False                # active DexScreener boost
    community_takeover: bool = False
    discovered_at: datetime = field(default_factory=lambda: datetime.now(tz=timezone.utc))
    source: str = "watchlist"           # watchlist / dexscreener / takeover / boost


def _get_json(url: str) -> dict | list | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": _UA, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        log.debug("alpha_universe fetch failed [%s]: %s", url[:80], exc)
        return None


# ── Binance Futures listing check ─────────────────────────────────────────────

def fetch_futures_symbols() -> set[str]:
    """Fetch all currently active Binance USDT-M Futures symbols.

    Returns set of symbols like {"BTCUSDT", "INUSDT", ...}
    """
    url = f"{_BINANCE_FAPI}/fapi/v1/exchangeInfo"
    data = _get_json(url)
    if not data or not isinstance(data, dict):
        return set()

    symbols = data.get("symbols", [])
    return {
        s["symbol"]
        for s in symbols
        if s.get("status") == "TRADING" and s.get("contractType") == "PERPETUAL"
    }


def is_futures_listed(base_symbol: str, futures_symbols: set[str] | None = None) -> bool:
    """Check if a token has an active Binance Futures (USDT-M perp) listing.

    Args:
        base_symbol: e.g. "IN", "NIGHT"
        futures_symbols: pre-fetched set to avoid repeated API calls
    """
    if futures_symbols is None:
        futures_symbols = fetch_futures_symbols()
    return f"{base_symbol.upper()}USDT" in futures_symbols


# ── DexScreener discovery ─────────────────────────────────────────────────────

def _get_dex_discovered(chain: str = "bsc") -> list[AlphaToken]:
    """Discover new Alpha candidates via DexScreener profile + takeover + boost feeds."""
    from data_cache.fetch_dexscreener import (
        fetch_dex_latest_profiles,
        fetch_dex_community_takeovers,
        fetch_dex_boosted_tokens,
    )

    discovered: dict[str, AlphaToken] = {}
    now = datetime.now(tz=timezone.utc)

    # New token profiles (recently updated = actively promoted)
    for profile in fetch_dex_latest_profiles(chain):
        addr = profile.get("tokenAddress", "")
        links = profile.get("links") or []
        # Extract symbol from links/description — approximate
        # Real symbol resolution happens via fetch_dex_token_data search
        key = addr.lower()
        if key and key not in discovered:
            discovered[key] = AlphaToken(
                symbol="",
                base="",
                chain=chain,
                dex_address=addr,
                source="dexscreener",
                discovered_at=now,
            )

    # Community takeovers — high conviction Alpha candidates
    for takeover in fetch_dex_community_takeovers(chain):
        addr = takeover.get("tokenAddress", "").lower()
        if addr:
            if addr in discovered:
                discovered[addr].community_takeover = True
            else:
                discovered[addr] = AlphaToken(
                    symbol="",
                    base="",
                    chain=chain,
                    dex_address=addr,
                    community_takeover=True,
                    source="takeover",
                    discovered_at=now,
                )

    # Boosted tokens — promotional spend = pump preparation
    for boost in fetch_dex_boosted_tokens(chain):
        addr = boost.get("tokenAddress", "").lower()
        if addr:
            if addr in discovered:
                discovered[addr].boosted = True
            else:
                discovered[addr] = AlphaToken(
                    symbol="",
                    base="",
                    chain=chain,
                    dex_address=addr,
                    boosted=True,
                    source="boost",
                    discovered_at=now,
                )

    return list(discovered.values())


# ── Universe builder ──────────────────────────────────────────────────────────

def build_alpha_universe(
    include_discovered: bool = True,
) -> list[AlphaToken]:
    """Build the full Alpha monitoring universe.

    Combines:
    1. Manual watchlist (ALPHA_WATCHLIST)
    2. DexScreener discovery (profiles + takeovers + boosts) if include_discovered
    3. Futures listing status check for all tokens

    Returns list of AlphaToken with futures_listed flag populated.
    """
    futures_symbols = fetch_futures_symbols()
    tokens: list[AlphaToken] = []

    # 1. Watchlist tokens
    for base, info in ALPHA_WATCHLIST.items():
        sym = f"{base}USDT"
        listed = is_futures_listed(base, futures_symbols)
        tokens.append(AlphaToken(
            symbol=sym,
            base=base,
            grade=info.get("grade", "B"),
            chain=info.get("chain", "bsc"),
            note=info.get("note", ""),
            futures_listed=listed,
            source="watchlist",
        ))

    # 2. DexScreener discovered (BSC + ETH + Base)
    if include_discovered:
        for chain in ("bsc", "ethereum", "base"):
            for token in _get_dex_discovered(chain):
                tokens.append(token)

    return tokens


def get_watchlist_symbols(grade_filter: str | None = None) -> list[str]:
    """Return Binance-style symbols from the watchlist.

    Args:
        grade_filter: "A", "B", or None for all grades

    Returns:
        List of symbols like ["INUSDT", "NIGHTUSDT", ...]
    """
    result = []
    for base, info in ALPHA_WATCHLIST.items():
        if grade_filter is None or info.get("grade") == grade_filter:
            result.append(f"{base}USDT")
    return result


def get_futures_listed_alpha() -> list[str]:
    """Return watchlist symbols that are actively listed on Binance Futures.

    These are the actionable ones for the engine (perp data available).
    """
    futures_symbols = fetch_futures_symbols()
    return [
        f"{base}USDT"
        for base in ALPHA_WATCHLIST
        if is_futures_listed(base, futures_symbols)
    ]


def build_universe_report() -> pd.DataFrame:
    """Build a DataFrame snapshot of the full universe status.

    Columns: symbol, base, grade, chain, futures_listed, boosted,
             community_takeover, source, note
    Useful for screening dashboard and periodic audits.
    """
    tokens = build_alpha_universe(include_discovered=False)  # watchlist only for speed
    rows = []
    for t in tokens:
        rows.append({
            "symbol":             t.symbol,
            "base":               t.base,
            "grade":              t.grade,
            "chain":              t.chain,
            "futures_listed":     t.futures_listed,
            "boosted":            t.boosted,
            "community_takeover": t.community_takeover,
            "source":             t.source,
            "note":               t.note,
        })
    return pd.DataFrame(rows)
