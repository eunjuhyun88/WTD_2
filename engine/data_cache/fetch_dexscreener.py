"""DexScreener data fetcher — BSC/ETH/Base chain DEX signals.

Strategy context: Binance Alpha → Futures pump pattern.
BSC-heavy tokens that appear on Binance Alpha and later get Futures listings
show repeated pump patterns. This module provides the DEX-native signals
needed to screen and time those opportunities.

Endpoints used (all free, no API key required, 60 req/min):
  /latest/dex/search?q={symbol}          — symbol-based pair lookup
  /token-pairs/v1/{chain}/{address}      — precise lookup when address known
  /token-profiles/latest/v1             — discovery: recent BSC token activity
  /community-takeovers/latest/v1        — community revived tokens (pump narrative)
  /token-boosts/latest/v1              — promoted tokens (pump preparation signal)
  /metas/trending/v1                   — sector momentum (screening criterion 3)

Per-symbol columns (registry-driven, snapshot → daily CSV accumulation):
  dex_market_cap        MC USD (screening: < 100M)
  dex_fdv               fully diluted valuation
  dex_liquidity_usd     pool depth USD
  dex_volume_h24        24h DEX volume USD
  dex_buy_txns_h24      buy transaction count
  dex_sell_txns_h24     sell transaction count
  dex_buy_pct           buys/(buys+sells) — DEX taker_buy_ratio proxy
  dex_price_change_h24  24h price change %
  dex_price_change_h6   6h price change %
  dex_has_twitter       has Twitter/X social link (1/0)
  dex_boost_active      active DexScreener boosts (promotion signal)
  dex_pair_age_days     days since pair creation (token age)
"""
from __future__ import annotations

import json
import logging
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

log = logging.getLogger("engine.data_cache.dexscreener")

_UA = "cogochi-autoresearch/dexscreener"
_BASE = "https://api.dexscreener.com"
_TIMEOUT = 15

# Chain priority for Binance Alpha strategy (BSC first)
_PREFERRED_CHAINS = ["bsc", "ethereum", "base"]

# Address cache: populated by fetch_dex_token_data as tokens are discovered
# Format: symbol_base → {"chain": str, "address": str}
# Pre-seeded with known Alpha watchlist tokens
TOKEN_ADDRESS_MAP: dict[str, dict[str, str]] = {
    # ETH chain tokens
    "IN":     {"chain": "ethereum", "address": "0xf929de51d91c77e42a5090069e2b1a2a61f4b30"},
    "IRYS":   {"chain": "ethereum", "address": "0x4f9fd6be4a90f2620860d680c0d4d5fb53d1a825"},
    "FLUID":  {"chain": "ethereum", "address": "0x6f40d4a6237c257fff2db00fa0510deeebf9591c"},
    "CARV":   {"chain": "ethereum", "address": "0x13a3f1c90b26b6afc94427f47453379c47cbe854"},
    "SQD":    {"chain": "ethereum", "address": "0x1337420ded5adb9980cfc35f8f2b054ea86f8ab1"},
    # BSC chain tokens
    "NIGHT":  {"chain": "bsc", "address": ""},  # to be discovered
    "UB":     {"chain": "bsc", "address": ""},
    "JCT":    {"chain": "bsc", "address": ""},
    "NAORIS": {"chain": "bsc", "address": ""},
    "KGEN":   {"chain": "bsc", "address": ""},
    "ON":     {"chain": "bsc", "address": ""},
    "ACU":    {"chain": "bsc", "address": ""},
    "BLUAI":  {"chain": "bsc", "address": ""},
    "AIO":    {"chain": "bsc", "address": ""},
    "BOB":    {"chain": "bsc", "address": ""},
    "VELVET": {"chain": "bsc", "address": ""},
    "AIN":    {"chain": "bsc", "address": ""},
    "US":     {"chain": "bsc", "address": ""},
    "DAM":    {"chain": "bsc", "address": ""},
    "IR":     {"chain": "bsc", "address": ""},
    # Base chain tokens
    "AERO":   {"chain": "base", "address": "0x940181a94a35a4569e4529a3cdfb74e38fd98631"},
}


def _get_json(url: str) -> dict | list | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": _UA, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        log.debug("dexscreener fetch failed [%s]: %s", url[:80], exc)
        return None


def _clean_symbol(symbol: str) -> str:
    """INUSDT → IN, BTCUSDT → BTC"""
    s = symbol.upper()
    for suffix in ("USDT", "BUSD", "USDC", "PERP"):
        if s.endswith(suffix):
            return s[: -len(suffix)]
    return s


def _pick_best_pair(pairs: list[dict], base_symbol: str) -> dict | None:
    """Select the most representative pair for a symbol.

    Priority: exact base symbol match → preferred chain → highest liquidity.
    Prefers USDT quote pairs on BSC (Binance Alpha canonical format).
    """
    # Exact symbol match, USDT/BUSD quote preferred
    candidates = [
        p for p in pairs
        if p.get("baseToken", {}).get("symbol", "").upper() == base_symbol.upper()
        and p.get("quoteToken", {}).get("symbol", "").upper() in ("USDT", "BUSD", "USDC")
    ]
    if not candidates:
        # Relaxed: any quote
        candidates = [
            p for p in pairs
            if p.get("baseToken", {}).get("symbol", "").upper() == base_symbol.upper()
        ]
    if not candidates:
        return None

    # Filter to preferred chains only
    chain_candidates = [p for p in candidates if p.get("chainId") in _PREFERRED_CHAINS]
    if chain_candidates:
        candidates = chain_candidates

    chain_rank = {c: i for i, c in enumerate(_PREFERRED_CHAINS)}

    def _score(p: dict) -> tuple:
        rank = chain_rank.get(p.get("chainId", ""), 99)
        liq = float((p.get("liquidity") or {}).get("usd") or 0)
        return (rank, -liq)

    return min(candidates, key=_score)


def _extract_features(pair: dict) -> dict:
    """Extract numeric signal features from a DexScreener Pair object."""
    txns_h24 = (pair.get("txns") or {}).get("h24") or {}
    buys = float(txns_h24.get("buys") or 0)
    sells = float(txns_h24.get("sells") or 0)
    buy_pct = buys / (buys + sells) if (buys + sells) > 0 else 0.5

    liquidity = pair.get("liquidity") or {}
    volume = pair.get("volume") or {}
    price_change = pair.get("priceChange") or {}
    socials = (pair.get("info") or {}).get("socials") or []
    boosts = pair.get("boosts") or {}

    has_twitter = any(
        s.get("platform", "").lower() in ("twitter", "x")
        for s in socials
    )

    created_ms = pair.get("pairCreatedAt")
    if created_ms:
        age_days = (datetime.now(tz=timezone.utc).timestamp() - created_ms / 1000) / 86400
    else:
        age_days = 0.0

    return {
        "dex_market_cap":       float(pair.get("marketCap") or 0),
        "dex_fdv":              float(pair.get("fdv") or 0),
        "dex_liquidity_usd":    float(liquidity.get("usd") or 0),
        "dex_volume_h24":       float(volume.get("h24") or 0),
        "dex_buy_txns_h24":     buys,
        "dex_sell_txns_h24":    sells,
        "dex_buy_pct":          buy_pct,
        "dex_price_change_h24": float(price_change.get("h24") or 0),
        "dex_price_change_h6":  float(price_change.get("h6") or 0),
        "dex_has_twitter":      1.0 if has_twitter else 0.0,
        "dex_boost_active":     float(boosts.get("active") or 0),
        "dex_pair_age_days":    age_days,
        # Metadata (not feature columns — used for address cache)
        "_chain":               pair.get("chainId", ""),
        "_token_address":       (pair.get("baseToken") or {}).get("address", ""),
        "_pair_address":        pair.get("pairAddress", ""),
    }


def _snapshot_to_df(features: dict, days: int) -> pd.DataFrame:
    """Convert a today-snapshot dict to a daily-indexed DataFrame.

    Today's values in last row; past `days-1` rows padded with defaults.
    Matches the pattern used by fetch_social.py for accumulation via CSV append.
    """
    today = datetime.now(tz=timezone.utc).date()
    dates = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    idx = pd.DatetimeIndex([pd.Timestamp(d, tz="UTC") for d in dates])

    numeric_cols = {
        k: v for k, v in features.items()
        if not k.startswith("_") and isinstance(v, (int, float))
    }

    # Defaults: 0.0 except dex_buy_pct which defaults to 0.5
    data = {col: [0.0] * len(dates) for col in numeric_cols}
    if "dex_buy_pct" in data:
        data["dex_buy_pct"] = [0.5] * len(dates)

    for col, val in numeric_cols.items():
        data[col][-1] = val

    return pd.DataFrame(data, index=idx)


# ── Main registry-driven fetcher ─────────────────────────────────────────────

def fetch_dex_token_data(symbol: str, days: int = 30) -> pd.DataFrame | None:
    """Fetch DEX market data for a token via DexScreener.

    Registry-compatible fetcher: (symbol, days) -> pd.DataFrame | None.
    Uses search endpoint for unknown tokens; precise token-pairs endpoint
    when contract address is known in TOKEN_ADDRESS_MAP.

    Auto-discovers and caches contract address on first successful fetch.

    Args:
        symbol: Binance-style (e.g. "INUSDT", "NIGHTUSDT")
        days:   lookback window for DataFrame index

    Returns:
        DataFrame with dex_* feature columns, None on failure.
    """
    base = _clean_symbol(symbol)
    pair: dict | None = None

    # Try precise lookup if address known and non-empty
    known = TOKEN_ADDRESS_MAP.get(base, {})
    if known.get("address") and known.get("chain"):
        url = f"{_BASE}/token-pairs/v1/{known['chain']}/{known['address']}"
        data = _get_json(url)
        if data and isinstance(data, list) and data:
            pair = _pick_best_pair(data, base)

    # Fallback: search by symbol
    if pair is None:
        url = f"{_BASE}/latest/dex/search?q={base}"
        data = _get_json(url)
        if data and isinstance(data, dict):
            pairs = [
                p for p in (data.get("pairs") or [])
                if p.get("chainId") in _PREFERRED_CHAINS
            ]
            pair = _pick_best_pair(pairs, base)

    if pair is None:
        log.debug("dexscreener: no pair found for %s", symbol)
        return None

    feats = _extract_features(pair)

    # Auto-update address map for future precise lookups
    if feats["_token_address"] and base in TOKEN_ADDRESS_MAP:
        TOKEN_ADDRESS_MAP[base]["address"] = feats["_token_address"]
        TOKEN_ADDRESS_MAP[base]["chain"] = feats["_chain"]

    return _snapshot_to_df(feats, days)


# ── Discovery endpoints ───────────────────────────────────────────────────────

def fetch_dex_latest_profiles(chain: str = "bsc") -> list[dict]:
    """Fetch latest token profiles for a chain — universe discovery.

    Returns tokens that recently added/updated DexScreener profiles.
    For BSC: effectively a Binance Alpha candidate feed.

    Each entry: {chainId, tokenAddress, description, links: [{type, url}]}
    The `links` array contains Twitter/X, Telegram, Website handles.
    """
    data = _get_json(f"{_BASE}/token-profiles/latest/v1")
    if not data or not isinstance(data, list):
        return []
    return [p for p in data if p.get("chainId") == chain]


def fetch_dex_community_takeovers(chain: str = "bsc") -> list[dict]:
    """Fetch community takeover tokens — strong pump narrative signal.

    Community takeovers = dead projects revived by community.
    Pattern: very low MC + new narrative = high pump potential.
    Maps to screening criteria 1 (MC) + 3 (sector narrative).

    Each entry: {chainId, tokenAddress, description, claimDate, links}
    """
    data = _get_json(f"{_BASE}/community-takeovers/latest/v1")
    if not data or not isinstance(data, list):
        return []
    return [p for p in data if p.get("chainId") == chain]


def fetch_dex_boosted_tokens(chain: str = "bsc") -> list[dict]:
    """Fetch tokens with active DexScreener promotional boosts.

    Boosted = someone paying for DexScreener visibility = pump preparation.
    Secondary Alpha discovery signal alongside Binance futures listing check.

    Each entry: {chainId, tokenAddress, type, impressions}
    """
    data = _get_json(f"{_BASE}/token-boosts/latest/v1")
    if not data or not isinstance(data, list):
        return []
    return [p for p in data if p.get("chainId") == chain]


def fetch_dex_trending_metas() -> pd.DataFrame | None:
    """Fetch trending metas (sectors/themes) from DexScreener.

    Maps to screening criterion 3: sector momentum check.
    A token whose sector is in trending metas = narrative tailwind.

    Returns DataFrame with columns:
        meta_name, meta_slug, meta_market_cap, meta_volume_h24,
        meta_mc_change_h1, meta_mc_change_h6, meta_mc_change_h24, meta_token_count
    """
    data = _get_json(f"{_BASE}/metas/trending/v1")
    if not data or not isinstance(data, list):
        return None

    records = []
    for m in data:
        mc_change = m.get("marketCapChange") or {}
        records.append({
            "meta_name":          m.get("name", ""),
            "meta_slug":          m.get("slug", ""),
            "meta_market_cap":    float(m.get("marketCap") or 0),
            "meta_volume_h24":    float(m.get("volume") or 0),
            "meta_liquidity":     float(m.get("liquidity") or 0),
            "meta_token_count":   int(m.get("tokenCount") or 0),
            "meta_mc_change_h1":  float(mc_change.get("h1") or 0),
            "meta_mc_change_h6":  float(mc_change.get("h6") or 0),
            "meta_mc_change_h24": float(mc_change.get("h24") or 0),
        })

    return pd.DataFrame(records) if records else None


def fetch_dex_token_batch(
    addresses: list[str],
    chain: str = "bsc",
) -> list[dict]:
    """Fetch multiple tokens by contract address in one call.

    Uses /tokens/v1/{chain}/{addresses} endpoint (comma-separated, max 30).
    Returns list of Pair dicts.
    """
    if not addresses:
        return []

    # DexScreener allows up to 30 addresses per call
    results: list[dict] = []
    for i in range(0, len(addresses), 30):
        batch = addresses[i : i + 30]
        addr_str = ",".join(batch)
        url = f"{_BASE}/tokens/v1/{chain}/{addr_str}"
        data = _get_json(url)
        if data and isinstance(data, list):
            results.extend(data)

    return results
