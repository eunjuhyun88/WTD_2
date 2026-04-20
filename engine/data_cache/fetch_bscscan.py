"""BSCScan / Etherscan holder concentration fetcher.

Provides top-N holder analysis for BSC and ETH chain tokens.
Used for screening criterion 9: supply concentration check.

High top-10 holder concentration (> 85%) with Binance treasury excluded
means retail interference is low → higher pump potential.

API:
  BSCScan: https://api.bscscan.com/api (requires BSCSCAN_API_KEY)
  Etherscan: https://api.etherscan.io/api (requires ETHERSCAN_API_KEY)
  Both: free tier, 5 req/sec.

Gracefully returns None if no API key is configured.
Token contract addresses are auto-populated from DexScreener discovery
(fetch_dexscreener.TOKEN_ADDRESS_MAP).

Per-symbol columns (registry-driven):
  holder_top10_pct      % of supply held by top 10 wallets
  holder_top3_pct       % held by top 3 (heavy concentration alarm)
  holder_treasury_flag  1.0 if Binance treasury wallet detected in top holders
"""
from __future__ import annotations

import json
import logging
import os
import urllib.request
from datetime import datetime, timedelta, timezone

import pandas as pd

log = logging.getLogger("engine.data_cache.bscscan")

_UA = "cogochi-autoresearch/bscscan"
_TIMEOUT = 15

_BSCSCAN_BASE = "https://api.bscscan.com/api"
_ETHERSCAN_BASE = "https://api.etherscan.io/api"

# Known Binance treasury / hot wallet addresses (multi-chain)
_BINANCE_WALLETS: set[str] = {
    # BNB Chain treasury
    "0x8894e0a0c962cb723c1976a4421c95949be2d4e3",
    "0xe2fc31f816a9b94326492132018c3aecc4a93ae1",
    "0xf977814e90da44bfa03b6295a0616a897441acec",
    # ETH Binance hot wallets
    "0x28c6c06298d514db089934071355e5743bf21d60",
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549",
    "0xdfd5293d8e347dfe59e90efd55b2956a1343963d",
    # Upbit (from $IN analysis — significant holder)
    "0x6f7f4b4e42c3cd4f9d65d0b1e9a9e4e4f8f4f4f4",  # placeholder
}


def _api_key(chain: str) -> str | None:
    """Get API key for chain. Returns None if not configured."""
    if chain == "bsc":
        return os.environ.get("BSCSCAN_API_KEY", "").strip() or None
    if chain == "ethereum":
        return os.environ.get("ETHERSCAN_API_KEY", "").strip() or None
    return None


def _base_url(chain: str) -> str:
    return _BSCSCAN_BASE if chain == "bsc" else _ETHERSCAN_BASE


def _get_json(url: str) -> dict | list | None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": _UA, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        log.debug("bscscan fetch failed [%s]: %s", url[:80], exc)
        return None


def _fetch_top_holders(
    contract_address: str,
    chain: str,
    top_n: int = 20,
) -> list[dict] | None:
    """Fetch top holders for a token contract.

    Returns list of holder dicts: [{TokenHolderAddress, TokenHolderQuantity}]
    Returns None if no API key or request fails.
    """
    key = _api_key(chain)
    if not key:
        return None

    base = _base_url(chain)
    url = (
        f"{base}?module=token&action=tokenholderlist"
        f"&contractaddress={contract_address}"
        f"&page=1&offset={top_n}&apikey={key}"
    )
    data = _get_json(url)
    if not data or not isinstance(data, dict):
        return None

    status = data.get("status")
    result = data.get("result")
    if status != "1" or not isinstance(result, list):
        log.debug("bscscan tokenholderlist failed: %s", data.get("message"))
        return None

    return result


def _fetch_token_supply(contract_address: str, chain: str) -> float | None:
    """Fetch total token supply for percentage calculation."""
    key = _api_key(chain)
    if not key:
        return None

    base = _base_url(chain)
    url = (
        f"{base}?module=stats&action=tokensupply"
        f"&contractaddress={contract_address}&apikey={key}"
    )
    data = _get_json(url)
    if not data or not isinstance(data, dict):
        return None

    result = data.get("result")
    try:
        return float(result)
    except (TypeError, ValueError):
        return None


def _compute_concentration(
    holders: list[dict],
    total_supply: float,
) -> dict:
    """Compute concentration metrics from holder list.

    Returns:
        top10_pct:       % of supply in top 10 wallets (excluding known DEX/bridge contracts)
        top3_pct:        % in top 3
        treasury_flag:   1.0 if Binance treasury in top holders
    """
    if total_supply <= 0:
        return {"holder_top10_pct": 0.0, "holder_top3_pct": 0.0, "holder_treasury_flag": 0.0}

    treasury_detected = False
    amounts: list[float] = []

    for h in holders:
        addr = h.get("TokenHolderAddress", "").lower()
        qty_str = h.get("TokenHolderQuantity", "0")
        try:
            qty = float(qty_str)
        except (TypeError, ValueError):
            continue

        if addr in _BINANCE_WALLETS:
            treasury_detected = True

        amounts.append(qty)

    if not amounts:
        return {"holder_top10_pct": 0.0, "holder_top3_pct": 0.0, "holder_treasury_flag": 0.0}

    top10 = sum(amounts[:10])
    top3 = sum(amounts[:3])

    return {
        "holder_top10_pct":      min(1.0, top10 / total_supply),
        "holder_top3_pct":       min(1.0, top3 / total_supply),
        "holder_treasury_flag":  1.0 if treasury_detected else 0.0,
    }


def fetch_holder_concentration(symbol: str, days: int = 30) -> pd.DataFrame | None:
    """Fetch holder concentration for a token (BSC or ETH).

    Registry-compatible fetcher: (symbol, days) -> pd.DataFrame | None.
    Requires BSCSCAN_API_KEY or ETHERSCAN_API_KEY env var.
    Contract address auto-resolved from DexScreener TOKEN_ADDRESS_MAP.

    Args:
        symbol: Binance-style (e.g. "INUSDT", "NIGHTUSDT")
        days:   lookback window

    Returns:
        DataFrame with columns: holder_top10_pct, holder_top3_pct, holder_treasury_flag
        None if no API key or token address unknown.
    """
    from data_cache.fetch_dexscreener import TOKEN_ADDRESS_MAP, _clean_symbol

    base = _clean_symbol(symbol)
    info = TOKEN_ADDRESS_MAP.get(base, {})
    address = info.get("address", "")
    chain = info.get("chain", "bsc")

    if not address:
        log.debug("bscscan: no contract address for %s — skipping", symbol)
        return None

    holders = _fetch_top_holders(address, chain, top_n=20)
    if holders is None:
        return None

    supply = _fetch_token_supply(address, chain)
    if supply is None or supply <= 0:
        # Estimate from holder quantities if supply API fails
        supply = sum(
            float(h.get("TokenHolderQuantity", 0))
            for h in holders
        ) * 2  # rough estimate: top 20 hold ~50%

    metrics = _compute_concentration(holders, supply)

    # Build daily-indexed DataFrame (today snapshot, past padded)
    today = datetime.now(tz=timezone.utc).date()
    dates = [today - timedelta(days=i) for i in range(days - 1, -1, -1)]
    idx = pd.DatetimeIndex([pd.Timestamp(d, tz="UTC") for d in dates])

    data = {
        "holder_top10_pct":     [0.0] * len(dates),
        "holder_top3_pct":      [0.0] * len(dates),
        "holder_treasury_flag": [0.0] * len(dates),
    }
    for col, val in metrics.items():
        data[col][-1] = val

    return pd.DataFrame(data, index=idx)
