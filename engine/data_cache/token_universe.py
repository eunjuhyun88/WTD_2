"""CoinMarketCap-level token universe indexer.

Data sources:
    1. Binance Futures exchange info  → all USDT perpetuals (is_futures)
    2. Binance /fapi/v1/ticker/24hr   → price, pct_24h, quoteVolume, OI
    3. Binance /fapi/v1/openInterest  → OI per symbol (parallel)
    4. CoinGecko /api/v3/coins/markets → market_cap, name, rank (free tier)

Sector classification is rule-based:
    - Deterministic symbol→sector mapping via SECTOR_MAP
    - Unknown symbols default to "Other"
    - Weighted trending score: combines volume rank, OI, pct_24h, market_cap rank

Cache:
    - Universe refreshed every 10 min (300 symbols ≈ 15s cold build)
    - Per-symbol OI fetched in parallel (asyncio.gather)
    - CoinGecko rate-limit: 10-50 calls/min free tier → fetch once per refresh

Usage:
    from data_cache.token_universe import get_universe
    tokens = await get_universe()   # list[TokenInfo]
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx

log = logging.getLogger("engine.token_universe")

# ---------------------------------------------------------------------------
# Sector map (symbol → sector)
# Covers top-500 Binance perpetual symbols.
# ---------------------------------------------------------------------------

SECTOR_MAP: dict[str, str] = {
    # Layer-0 / Store-of-Value
    "BTC":  "BTC",
    "WBTC": "BTC",
    "CBBTC": "BTC",

    # Layer-1
    "ETH":  "ETH",
    "SOL":  "L1",
    "BNB":  "L1",
    "ADA":  "L1",
    "AVAX": "L1",
    "DOT":  "L1",
    "ATOM": "L1",
    "NEAR": "L1",
    "APT":  "L1",
    "SUI":  "L1",
    "SEI":  "L1",
    "TON":  "L1",
    "TRX":  "L1",
    "XRP":  "L1",
    "LTC":  "L1",
    "BCH":  "L1",
    "ETC":  "L1",
    "FIL":  "L1",
    "ICP":  "L1",
    "HBAR": "L1",
    "INJ":  "L1",
    "KAS":  "L1",
    "STX":  "L1",
    "ALGO": "L1",
    "EGLD": "L1",
    "KAVA": "L1",
    "CELO": "L1",

    # Layer-2 / Scaling
    "MATIC": "L2",
    "POL":   "L2",
    "ARB":   "L2",
    "OP":    "L2",
    "STRK":  "L2",
    "IMX":   "L2",
    "METIS": "L2",
    "MANTA": "L2",
    "ZETA":  "L2",
    "BOBA":  "L2",
    "ZK":    "L2",
    "SCROLL": "L2",
    "LINEA": "L2",
    "BLAST": "L2",
    "TAIKO": "L2",

    # DeFi
    "UNI":   "DeFi",
    "AAVE":  "DeFi",
    "CRV":   "DeFi",
    "MKR":   "DeFi",
    "SNX":   "DeFi",
    "COMP":  "DeFi",
    "YFI":   "DeFi",
    "SUSHI": "DeFi",
    "BAL":   "DeFi",
    "1INCH": "DeFi",
    "LDO":   "DeFi",
    "RPL":   "DeFi",
    "RUNE":  "DeFi",
    "DYDX":  "DeFi",
    "GMX":   "DeFi",
    "GNS":   "DeFi",
    "PENDLE":"DeFi",
    "CVX":   "DeFi",
    "FXS":   "DeFi",
    "OSMO":  "DeFi",
    "JUP":   "DeFi",
    "RAY":   "DeFi",
    "ORCA":  "DeFi",
    "CAKE":  "DeFi",
    "JOE":   "DeFi",

    # AI / ML
    "FET":   "AI",
    "AGIX":  "AI",
    "OCEAN": "AI",
    "TAO":   "AI",
    "RENDER":"AI",
    "RNDR":  "AI",
    "ARKM":  "AI",
    "WLD":   "AI",
    "PAAL":  "AI",
    "PRIME": "AI",
    "GRT":   "AI",
    "NMR":   "AI",
    "ALT":   "AI",

    # Meme
    "DOGE":  "Meme",
    "SHIB":  "Meme",
    "PEPE":  "Meme",
    "FLOKI": "Meme",
    "BONK":  "Meme",
    "WIF":   "Meme",
    "BOME":  "Meme",
    "MEME":  "Meme",
    "NEIRO": "Meme",
    "COQ":   "Meme",
    "MEW":   "Meme",
    "POPCAT":"Meme",
    "BRETT": "Meme",

    # Exchange / CEX tokens
    "BNB":  "Exchange",   # already L1, overridden
    "OKB":  "Exchange",
    "CRO":  "Exchange",
    "HT":   "Exchange",
    "KCS":  "Exchange",
    "GT":   "Exchange",
    "FTT":  "Exchange",

    # Gaming / Metaverse
    "AXS":  "Gaming",
    "SAND": "Gaming",
    "MANA": "Gaming",
    "ENJ":  "Gaming",
    "GALA": "Gaming",
    "IMX":  "Gaming",   # also L2
    "MAGIC":"Gaming",
    "BEAM": "Gaming",
    "RON":  "Gaming",
    "YGG":  "Gaming",
    "PIXEL":"Gaming",
    "PORTAL":"Gaming",
    "MAVIA":"Gaming",
    "CYBER":"Gaming",

    # Infrastructure / Oracles
    "LINK": "Infra",
    "VET":  "Infra",
    "QNT":  "Infra",
    "BAND": "Infra",
    "API3": "Infra",
    "PYTH": "Infra",
    "UMA":  "Infra",
    "ORBS": "Infra",

    # Privacy
    "XMR":  "Privacy",
    "ZEC":  "Privacy",
    "DASH": "Privacy",
    "SCRT": "Privacy",

    # Stablecoins (usually not in futures but included for completeness)
    "USDT": "Stablecoin",
    "USDC": "Stablecoin",
    "BUSD": "Stablecoin",
    "DAI":  "Stablecoin",

    # RWA / Real-World Assets
    "ONDO": "RWA",
    "CFG":  "RWA",
    "MPL":  "RWA",

    # Liquid Staking
    "STETH":"LST",
    "CBETH":"LST",
    "RETH": "LST",
    "FRXETH":"LST",
    "ANKR": "LST",
    "SFRXETH":"LST",

    # Social / Fan
    "CHZ": "Social",
    "SANTOS":"Social",
    "LAZIO":"Social",
}


def get_sector(symbol: str) -> str:
    """Map a symbol (with or without USDT suffix) to its sector."""
    base = symbol.upper().replace("USDT", "").replace("BUSD", "").replace("BTC", "")
    # Try base first, then full symbol
    return SECTOR_MAP.get(base, SECTOR_MAP.get(symbol.upper().replace("USDT", ""), "Other"))


# ---------------------------------------------------------------------------
# Universe builder
# ---------------------------------------------------------------------------

BINANCE_FAPI = "https://fapi.binance.com"
COINGECKO_API = "https://api.coingecko.com/api/v3"

_REFRESH_INTERVAL_S = 600   # 10 minutes
_PARALLEL_OI_LIMIT  = 50    # concurrent OI fetches (semaphore)

# Module-level cache
_cache: dict[str, Any] = {
    "tokens": [],
    "updated_at": None,
    "ts": 0.0,
}


async def _fetch_futures_tickers(client: httpx.AsyncClient) -> list[dict]:
    """GET /fapi/v1/ticker/24hr — all USDT perpetuals."""
    try:
        r = await client.get(f"{BINANCE_FAPI}/fapi/v1/ticker/24hr", timeout=10)
        r.raise_for_status()
        data = r.json()
        # Filter: USDT-quoted perpetuals only
        return [d for d in data if str(d.get("symbol", "")).endswith("USDT")]
    except Exception as exc:
        log.warning("futures ticker fetch failed: %s", exc)
        return []


async def _fetch_exchange_info(client: httpx.AsyncClient) -> dict[str, str]:
    """GET /fapi/v1/exchangeInfo → {symbol: baseAsset} mapping."""
    try:
        r = await client.get(f"{BINANCE_FAPI}/fapi/v1/exchangeInfo", timeout=15)
        r.raise_for_status()
        data = r.json()
        return {
            sym["symbol"]: sym["baseAsset"]
            for sym in data.get("symbols", [])
            if sym.get("status") == "TRADING" and sym.get("quoteAsset") == "USDT"
        }
    except Exception as exc:
        log.warning("exchange info fetch failed: %s", exc)
        return {}


async def _fetch_oi_one(client: httpx.AsyncClient, sem: asyncio.Semaphore, symbol: str) -> float:
    """GET /fapi/v1/openInterest for one symbol → notional USD (approx)."""
    async with sem:
        try:
            r = await client.get(
                f"{BINANCE_FAPI}/fapi/v1/openInterest",
                params={"symbol": symbol},
                timeout=5,
            )
            if not r.is_success:
                return 0.0
            d = r.json()
            return float(d.get("openInterest", 0))
        except Exception:
            return 0.0


async def _fetch_coingecko_market_cap(
    client: httpx.AsyncClient,
    base_assets: list[str],
) -> dict[str, dict]:
    """GET /api/v3/coins/markets — returns {base: {market_cap, name, rank}}.

    CoinGecko free tier: 30 requests/min. We batch top-250 symbols in 3 pages.
    """
    result: dict[str, dict] = {}
    for page in range(1, 4):  # pages 1–3 = top 750
        try:
            r = await client.get(
                f"{COINGECKO_API}/coins/markets",
                params={
                    "vs_currency": "usd",
                    "order": "market_cap_desc",
                    "per_page": 250,
                    "page": page,
                    "sparkline": "false",
                    "price_change_percentage": "24h",
                },
                timeout=10,
            )
            if not r.is_success:
                log.warning("CoinGecko page %d failed: %s", page, r.status_code)
                break
            for coin in r.json():
                sym = coin.get("symbol", "").upper()
                result[sym] = {
                    "name":       coin.get("name", sym),
                    "market_cap": float(coin.get("market_cap") or 0),
                    "rank":       int(coin.get("market_cap_rank") or 9999),
                }
        except Exception as exc:
            log.warning("CoinGecko fetch page %d failed: %s", page, exc)
            break
    return result


async def _build_universe() -> list[dict]:
    """Build ranked token list from Binance + CoinGecko data."""
    async with httpx.AsyncClient(follow_redirects=True) as client:
        # --- Parallel: exchange info + tickers + CoinGecko -------------------
        info_task    = asyncio.create_task(_fetch_exchange_info(client))
        tickers_task = asyncio.create_task(_fetch_futures_tickers(client))

        info_map, tickers = await asyncio.gather(info_task, tickers_task)

        if not tickers:
            log.warning("No futures tickers returned — universe empty")
            return []

        # --- Parallel OI fetches (semaphore-limited) -------------------------
        sem = asyncio.Semaphore(_PARALLEL_OI_LIMIT)
        symbols = [t["symbol"] for t in tickers]
        prices  = {t["symbol"]: float(t.get("lastPrice") or 0) for t in tickers}

        oi_tasks = [_fetch_oi_one(client, sem, sym) for sym in symbols]
        oi_raw   = await asyncio.gather(*oi_tasks)
        oi_map   = dict(zip(symbols, oi_raw))

        # --- CoinGecko market cap -------------------------------------------
        base_assets = list({info_map.get(s, s.replace("USDT", "")) for s in symbols})
        cg_map = await _fetch_coingecko_market_cap(client, base_assets)

    # --- Build TokenInfo rows ------------------------------------------------
    rows: list[dict] = []
    total_vol = sum(float(t.get("quoteVolume") or 0) for t in tickers) or 1.0

    for t in tickers:
        sym   = t["symbol"]
        base  = info_map.get(sym, sym.replace("USDT", ""))
        price = float(t.get("lastPrice") or 0)
        pct24 = float(t.get("priceChangePercent") or 0)
        vol24 = float(t.get("quoteVolume") or 0)
        oi_coins = oi_map.get(sym, 0.0)
        oi_usd   = oi_coins * price

        cg = cg_map.get(base.upper(), {})
        mc   = cg.get("market_cap", 0.0)
        name = cg.get("name", base)
        cg_rank = cg.get("rank", 9999)

        sector = get_sector(sym)

        # Trending score: vol rank + OI rank + abs(pct24) + mc rank bonus
        vol_frac   = vol24 / total_vol * 100   # 0–100
        oi_score   = min(oi_usd / 1e9, 10)     # 0–10 (capped at $10B)
        pct_score  = min(abs(pct24), 20) / 2   # 0–10
        mc_bonus   = max(0, 10 - cg_rank / 100)  # top-100 CG = up to +10
        trending   = round(vol_frac + oi_score + pct_score + mc_bonus, 3)

        rows.append({
            "symbol":        sym,
            "base":          base,
            "name":          name,
            "sector":        sector,
            "price":         price,
            "pct_24h":       pct24,
            "vol_24h_usd":   vol24,
            "market_cap":    mc,
            "oi_usd":        oi_usd,
            "is_futures":    True,
            "trending_score": trending,
            "cg_rank":       cg_rank,
        })

    # --- Sort: primary = CoinGecko rank, secondary = volume ------------------
    rows.sort(key=lambda r: (r["cg_rank"], -r["vol_24h_usd"]))

    # Assign display rank
    for i, row in enumerate(rows, 1):
        row["rank"] = i

    return rows


async def get_universe(force_refresh: bool = False) -> list[dict]:
    """Return cached token universe, refreshing if stale (>10 min).

    Each dict matches the TokenInfo schema fields.
    """
    now = time.time()
    if (
        force_refresh
        or not _cache["tokens"]
        or now - _cache["ts"] > _REFRESH_INTERVAL_S
    ):
        log.info("Refreshing token universe...")
        t0 = now
        try:
            tokens = await _build_universe()
            _cache["tokens"]     = tokens
            _cache["ts"]         = time.time()
            _cache["updated_at"] = datetime.now(timezone.utc).isoformat()
            log.info(
                "Universe refreshed: %d tokens in %.1fs",
                len(tokens), time.time() - t0,
            )
        except Exception as exc:
            log.error("Universe refresh failed: %s", exc)
            if not _cache["tokens"]:
                raise

    return _cache["tokens"]


def get_cached_universe() -> list[dict]:
    """Synchronous accessor — returns cached universe (possibly empty)."""
    return _cache["tokens"]


def get_universe_updated_at() -> str:
    return _cache.get("updated_at") or datetime.now(timezone.utc).isoformat()
