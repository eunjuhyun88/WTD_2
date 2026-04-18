"""OKX On-chain Smart Money real-time signal fetcher.

Endpoint: web3.okx.com/api/v6/dex/market/signal/list (via MCP or direct API)

Design: The OKX Signal API is a real-time feed — no historical daily data.
This module provides a TTL-cached lookup function used directly by the
smart_money_accumulation confirmation block at score time.

API returns signals triggered when tracked wallets (Smart Money / KOL / Whales)
make large trades. Each signal includes:
    - walletType  : 1=Smart Money, 2=KOL, 3=Whale
    - amountUsd   : total USD traded in the signal event
    - soldRatioPercent : % of position already sold (low = accumulating)
    - triggerWalletCount : # of distinct tracked wallets in the event
    - timestamp   : unix ms

Supported chains: Solana (501), Ethereum (1), BSC (56), Base (8453).
BTC (native chain) not supported — returns empty result gracefully.

Auth: OKX_API_KEY + OKX_SECRET_KEY + OKX_PASSPHRASE in env.
Falls back to public sandbox key if env absent (rate-limited, dev only).

Anchor:
    OKX Onchain OS Signal API — "Smart Money" tag = wallets with sustained
    high win-rate and PnL over rolling 30d window, tracked by OKX on-chain
    analytics. Analogous to Nansen Smart Money label.
"""
from __future__ import annotations

import base64
import hashlib
import hmac as hmac_mod
import json
import logging
import os
import time
import urllib.request
from datetime import datetime, timezone

log = logging.getLogger("engine.data_cache.okx_smart_money")

_BASE = "https://web3.okx.com"
_TIMEOUT = 15
_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
_EXTRA_HEADERS = {"Origin": "https://web3.okx.com", "Referer": "https://web3.okx.com/"}

# Public sandbox key from OKX docs — dev/testing only
_SANDBOX_KEY = "d573a84c-8e79-4a35-b0c6-427e9ad2478d"

# TTL for cached signal results (seconds)
_CACHE_TTL = 300  # 5 min

# In-memory cache: key → (timestamp, result). Max 64 entries — evict oldest on overflow.
_CACHE: dict[str, tuple[float, list[dict]]] = {}
_CACHE_MAX = 64

# walletType: 1=Smart Money, 2=KOL, 3=Whale (MCP convention)
WALLET_TYPE_SMART_MONEY = "1"
WALLET_TYPE_KOL = "2"
WALLET_TYPE_WHALE = "3"

# Symbol → (chainIndex, tokenContractAddress)
# Covers on-chain tokens that trade on Binance as well as on DEXes.
# BTC/ETH are CEX-native → empty strings → graceful skip.
#
# chainIndex values: "501" = Solana, "1" = Ethereum, "" = CEX-only skip.
# When adding a symbol, verify the contract address against an authoritative
# source (Coinbase Assets post, CoinGecko, official project channel). Wrong
# addresses silently return empty signals — they don't crash, but they waste
# API quota and mislead whale-accumulation detection.
SYMBOL_CHAIN_MAP: dict[str, tuple[str, str]] = {
    # Solana
    "FARTCOINUSDT":  ("501", "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump"),
    "WIFUSDT":       ("501", "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"),
    "BONKUSDT":      ("501", "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"),
    "JUPUSDT":       ("501", "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"),
    "RAYUSDT":       ("501", "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"),
    # W-0097 P2 additions — verified via Coinbase Assets on X (2026-04-19).
    "TRUMPUSDT":     ("501", "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN"),
    "POPCATUSDT":    ("501", "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"),
    # Ethereum
    "PEPEUSDT":      ("1",   "0x6982508145454Ce325dDbE47a25d4ec3d2311933"),
    "SHIBUSDT":      ("1",   "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE"),
    "FLOKIUSDT":     ("1",   "0xcf0C122c6b73ff809C693DB761e7BaeBe62b6a2E"),
    # CEX-native perps → not on-chain
    "BTCUSDT": ("", ""),
    "ETHUSDT":  ("", ""),
    "SOLUSDT":  ("", ""),
}


SUPPORTED_CHAIN_INDICES = frozenset({"", "1", "501"})
# Minimum realistic lengths for address formats we accept. Ethereum 0x +
# 40 hex = 42. Solana base58 addresses are typically 32-44 chars.
_ETH_ADDR_LEN = 42
_SOL_ADDR_MIN_LEN = 32
_SOL_ADDR_MAX_LEN = 44


def validate_symbol_chain_map(
    mapping: dict[str, tuple[str, str]] | None = None,
) -> list[str]:
    """Return a list of format errors, one per offending entry. Empty = OK.

    Kept as a helper (not module-import assert) so new symbols can be added
    incrementally without breaking a live service. Called from the test
    suite as a regression gate.
    """
    target = mapping if mapping is not None else SYMBOL_CHAIN_MAP
    errors: list[str] = []
    for symbol, pair in target.items():
        if not isinstance(pair, tuple) or len(pair) != 2:
            errors.append(f"{symbol}: value must be (chain_index, address) tuple")
            continue
        chain, addr = pair
        if chain not in SUPPORTED_CHAIN_INDICES:
            errors.append(
                f"{symbol}: chain_index {chain!r} not in SUPPORTED_CHAIN_INDICES"
            )
            continue
        if chain == "" and addr != "":
            errors.append(f"{symbol}: CEX-native entry must have empty address")
            continue
        if chain == "" and addr == "":
            continue  # CEX-native, fine
        if not addr:
            errors.append(f"{symbol}: on-chain entry missing contract address")
            continue
        if chain == "1":
            if not addr.startswith("0x") or len(addr) != _ETH_ADDR_LEN:
                errors.append(
                    f"{symbol}: Ethereum address must be 0x + 40 hex, got {addr!r}"
                )
        elif chain == "501":
            if not (_SOL_ADDR_MIN_LEN <= len(addr) <= _SOL_ADDR_MAX_LEN):
                errors.append(
                    f"{symbol}: Solana address length out of {_SOL_ADDR_MIN_LEN}-{_SOL_ADDR_MAX_LEN}"
                )
    return errors


def _build_signed_headers(method: str, path: str, query_or_body: str = "") -> dict:
    """Build OKX HMAC-signed request headers from env vars."""
    api_key = os.environ.get("OKX_API_KEY", "")
    secret_key = os.environ.get("OKX_SECRET_KEY", "")
    passphrase = os.environ.get("OKX_PASSPHRASE", "")

    base = {
        "User-Agent": _UA,
        "Accept": "application/json",
        "Content-Type": "application/json",
        **_EXTRA_HEADERS,
    }

    if not all([api_key, secret_key, passphrase]):
        return {"OK-ACCESS-KEY": _SANDBOX_KEY, **base}

    ts = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    # GET: append ?query_string; POST: append raw body
    if method == "GET" and query_or_body:
        suffix = f"?{query_or_body}"
    else:
        suffix = query_or_body
    pre_hash = ts + method + path + suffix
    sig = base64.b64encode(
        hmac_mod.new(secret_key.encode(), pre_hash.encode(), hashlib.sha256).digest()
    ).decode()

    return {
        "OK-ACCESS-KEY": api_key,
        "OK-ACCESS-SIGN": sig,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": passphrase,
        **base,
    }


def _fetch_signals_raw(
    chain_index: str,
    token_address: str,
    wallet_types: str = "1,2,3",
    min_amount_usd: float = 1000.0,
    limit: int = 100,
) -> list[dict]:
    """Fetch raw signal list from OKX API (POST)."""
    path = "/api/v6/dex/market/signal/list"
    body: dict[str, str] = {
        "chainIndex": chain_index,
        "walletType": wallet_types,
        "minAmountUsd": str(min_amount_usd),
        "limit": str(limit),
    }
    if token_address:
        body["tokenAddress"] = token_address

    body_str = json.dumps(body)
    headers = _build_signed_headers("POST", path, body_str)
    req = urllib.request.Request(
        f"{_BASE}{path}",
        data=body_str.encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("code") not in ("0", 0):
                log.debug("OKX signal error [%s]: %s", data.get("code"), data.get("msg"))
                return []
            return data.get("data") or []
    except Exception as exc:
        log.debug("OKX signal fetch failed: %s", exc)
        return []


def get_smart_money_signals(
    symbol: str,
    wallet_types: str = "1,2,3",
    min_amount_usd: float = 1000.0,
    max_age_hours: float = 24.0,
) -> list[dict]:
    """Return recent smart money signals for `symbol` (TTL-cached).

    Args:
        symbol:         Binance-style symbol e.g. "FARTCOINUSDT"
        wallet_types:   Comma-separated wallet type IDs (1=Smart Money, 2=KOL, 3=Whale)
        min_amount_usd: Minimum trade size in USD
        max_age_hours:  Filter out signals older than this many hours

    Returns:
        List of signal dicts, empty if symbol not on-chain or on failure.
    """
    chain_index, token_address = SYMBOL_CHAIN_MAP.get(symbol, ("", ""))
    if not chain_index or not token_address:
        return []

    cache_key = f"{symbol}:{wallet_types}:{min_amount_usd}:{max_age_hours}"
    cached_ts, cached_result = _CACHE.get(cache_key, (0.0, []))
    if time.time() - cached_ts < _CACHE_TTL:
        return cached_result

    signals = _fetch_signals_raw(chain_index, token_address, wallet_types, min_amount_usd)

    # Filter by age
    cutoff_ms = (time.time() - max_age_hours * 3600) * 1000
    signals = [s for s in signals if int(s.get("timestamp", 0)) >= cutoff_ms]

    # Evict oldest entry if cache is at capacity
    if len(_CACHE) >= _CACHE_MAX:
        oldest = min(_CACHE, key=lambda k: _CACHE[k][0])
        del _CACHE[oldest]

    _CACHE[cache_key] = (time.time(), signals)
    return signals


def compute_smart_money_score(signals: list[dict]) -> dict:
    """Aggregate signals into a structured score dict.

    Returns:
        {
            "buy_wallet_count"  : # unique buying wallets,
            "sell_wallet_count" : # unique selling wallets (high soldRatio),
            "net_buy_usd"       : net USD (buy - sell),
            "accumulating"      : True if buy_wallet_count >= 2 and net_buy_usd > 0,
        }
    """
    buy_wallets: set[str] = set()
    sell_wallets: set[str] = set()
    total_buy_usd = 0.0
    total_sell_usd = 0.0

    for sig in signals:
        amount = float(sig.get("amountUsd", 0))
        sold_pct = float(sig.get("soldRatioPercent", 0)) / 100.0
        buy_usd = amount * (1 - sold_pct)
        sell_usd = amount * sold_pct

        for addr in sig.get("triggerWalletAddress", "").split(","):
            addr = addr.strip()
            if not addr:
                continue
            if sold_pct < 0.5:
                buy_wallets.add(addr)
            else:
                sell_wallets.add(addr)

        total_buy_usd += buy_usd
        total_sell_usd += sell_usd

    net = total_buy_usd - total_sell_usd
    return {
        "buy_wallet_count": len(buy_wallets),
        "sell_wallet_count": len(sell_wallets),
        "net_buy_usd": net,
        "accumulating": len(buy_wallets) >= 2 and net > 0,
    }
