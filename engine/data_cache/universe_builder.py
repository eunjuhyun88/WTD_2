"""CMC 1000+ universe builder.

Sources:
  1. CoinGecko /coins/markets (4 pages × 250 = top 1000, free, no key)
  2. Binance Futures /fapi/v1/exchangeInfo → USDT perpetuals (~530)
  3. Binance Spot /api/v3/exchangeInfo → USDT spot pairs (fallback for remainder)

Output: universe.parquet with columns:
  symbol, base, name, exchange, has_perp, rank, market_cap_usd, volume_24h_usd, price_usd

Usage:
    from data_cache.universe_builder import build_universe, load_universe
    df = await build_universe()   # ~5s cold, saves universe.parquet
    df = load_universe()          # instant, reads parquet
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pandas as pd

log = logging.getLogger("engine.universe_builder")

_BASE_DIR = Path(__file__).parent / "market_data"
_UNIVERSE_PATH = _BASE_DIR / "universe.parquet"
_COINGECKO_API = "https://api.coingecko.com/api/v3"
_BINANCE_FAPI = "https://fapi.binance.com"
_BINANCE_SPOT = "https://api.binance.com"
_UA = "cogochi-pipeline/universe-builder"
_REFRESH_TTL_S = 3600  # 1h cache for universe metadata


# ── CoinGecko top-1000 ───────────────────────────────────────────────────────

async def _fetch_coingecko_page(
    client: httpx.AsyncClient, page: int, retries: int = 3
) -> list[dict]:
    """Fetch one page (250 coins) from CoinGecko /coins/markets."""
    for attempt in range(retries):
        try:
            r = await client.get(
                f"{_COINGECKO_API}/coins/markets",
                params={
                    "vs_currency": "usd",
                    "order": "market_cap_desc",
                    "per_page": 250,
                    "page": page,
                    "sparkline": "false",
                },
                timeout=15,
            )
            if r.status_code == 429:
                wait = 60 * (attempt + 1)
                log.warning("CoinGecko rate limit page %d, sleeping %ds", page, wait)
                await asyncio.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            if attempt == retries - 1:
                log.warning("CoinGecko page %d failed after %d attempts: %s", page, retries, exc)
                return []
            await asyncio.sleep(5 * (attempt + 1))
    return []


async def _fetch_coingecko_top1000(client: httpx.AsyncClient) -> dict[str, dict]:
    """Fetch top 1000 coins from CoinGecko. Returns {SYMBOL_UPPER: {rank, name, market_cap, price}}."""
    result: dict[str, dict] = {}
    for page in range(1, 5):  # pages 1–4 = top 1000
        coins = await _fetch_coingecko_page(client, page)
        for coin in coins:
            sym = coin.get("symbol", "").upper()
            result[sym] = {
                "name": coin.get("name", sym),
                "cg_rank": int(coin.get("market_cap_rank") or 9999),
                "market_cap_usd": float(coin.get("market_cap") or 0),
                "price_usd": float(coin.get("current_price") or 0),
                "volume_24h_usd": float(coin.get("total_volume") or 0),
            }
        # CoinGecko free tier: ~30 req/min → 2s between pages
        if page < 4:
            await asyncio.sleep(2)
    log.info("CoinGecko: %d coins fetched", len(result))
    return result


# ── Binance exchange info ────────────────────────────────────────────────────

async def _fetch_futures_symbols(client: httpx.AsyncClient) -> dict[str, str]:
    """Returns {symbol: baseAsset} for all active USDT perpetuals."""
    try:
        r = await client.get(f"{_BINANCE_FAPI}/fapi/v1/exchangeInfo", timeout=15)
        r.raise_for_status()
        data = r.json()
        return {
            s["symbol"]: s["baseAsset"]
            for s in data.get("symbols", [])
            if s.get("status") == "TRADING"
            and s.get("quoteAsset") == "USDT"
            and s.get("contractType") == "PERPETUAL"
        }
    except Exception as exc:
        log.warning("Futures exchangeInfo failed: %s", exc)
        return {}


async def _fetch_spot_symbols(client: httpx.AsyncClient) -> dict[str, str]:
    """Returns {symbol: baseAsset} for all active USDT spot pairs."""
    try:
        r = await client.get(f"{_BINANCE_SPOT}/api/v3/exchangeInfo", timeout=15)
        r.raise_for_status()
        data = r.json()
        return {
            s["symbol"]: s["baseAsset"]
            for s in data.get("symbols", [])
            if s.get("status") == "TRADING" and s.get("quoteAsset") == "USDT"
        }
    except Exception as exc:
        log.warning("Spot exchangeInfo failed: %s", exc)
        return {}


async def _fetch_futures_tickers(client: httpx.AsyncClient) -> dict[str, dict]:
    """Returns {symbol: {price, volume_24h}} from Binance Futures 24hr ticker."""
    try:
        r = await client.get(f"{_BINANCE_FAPI}/fapi/v1/ticker/24hr", timeout=10)
        r.raise_for_status()
        return {
            t["symbol"]: {
                "price_usd": float(t.get("lastPrice") or 0),
                "volume_24h_usd": float(t.get("quoteVolume") or 0),
            }
            for t in r.json()
            if str(t.get("symbol", "")).endswith("USDT")
        }
    except Exception as exc:
        log.warning("Futures tickers failed: %s", exc)
        return {}


async def _fetch_spot_tickers(client: httpx.AsyncClient) -> dict[str, dict]:
    """Returns {symbol: {price, volume_24h}} from Binance Spot 24hr ticker."""
    try:
        r = await client.get(f"{_BINANCE_SPOT}/api/v3/ticker/24hr", timeout=10)
        r.raise_for_status()
        return {
            t["symbol"]: {
                "price_usd": float(t.get("lastPrice") or 0),
                "volume_24h_usd": float(t.get("quoteVolume") or 0),
            }
            for t in r.json()
            if str(t.get("symbol", "")).endswith("USDT")
        }
    except Exception as exc:
        log.warning("Spot tickers failed: %s", exc)
        return {}


# ── Universe builder ─────────────────────────────────────────────────────────

async def build_universe(
    min_rank: int = 1000,
    save: bool = True,
) -> pd.DataFrame:
    """Build the full CMC 1000+ universe DataFrame.

    Logic:
      1. CoinGecko top 1000 → rank + market_cap for all coins
      2. Binance Futures → has_perp=True (~530 symbols)
      3. For CG top-1000 coins without perp: check Binance Spot
      4. Merge and return ranked DataFrame

    Returns DataFrame with columns:
      symbol, base, name, exchange, has_perp, cg_rank,
      market_cap_usd, price_usd, volume_24h_usd
    """
    t0 = time.monotonic()
    async with httpx.AsyncClient(headers={"User-Agent": _UA}, follow_redirects=True) as client:
        # Parallel: CG top-1000 + Binance exchange infos + tickers
        cg_task = asyncio.create_task(_fetch_coingecko_top1000(client))
        fut_info_task = asyncio.create_task(_fetch_futures_symbols(client))
        spot_info_task = asyncio.create_task(_fetch_spot_symbols(client))
        fut_tick_task = asyncio.create_task(_fetch_futures_tickers(client))
        spot_tick_task = asyncio.create_task(_fetch_spot_tickers(client))

        cg_map, fut_info, spot_info, fut_tick, spot_tick = await asyncio.gather(
            cg_task, fut_info_task, spot_info_task, fut_tick_task, spot_tick_task
        )

    fut_symbols: set[str] = set(fut_info.keys())
    spot_symbols: set[str] = set(spot_info.keys())

    rows: list[dict] = []

    # Pass 1: All Binance Futures USDT perps
    for sym, base in fut_info.items():
        tick = fut_tick.get(sym, {})
        cg = cg_map.get(base.upper(), {})
        rows.append({
            "symbol": sym,
            "base": base,
            "name": cg.get("name", base),
            "exchange": "binance_futures",
            "has_perp": True,
            "cg_rank": cg.get("cg_rank", 9999),
            "market_cap_usd": cg.get("market_cap_usd", 0.0),
            "price_usd": tick.get("price_usd") or cg.get("price_usd", 0.0),
            "volume_24h_usd": tick.get("volume_24h_usd", 0.0),
        })

    # Pass 2: CG top-1000 coins not in Futures → add Spot if available
    fut_bases: set[str] = {v.upper() for v in fut_info.values()}
    for base_upper, cg in cg_map.items():
        if cg.get("cg_rank", 9999) > min_rank:
            continue
        if base_upper in fut_bases:
            continue  # already covered by futures
        spot_sym = f"{base_upper}USDT"
        if spot_sym not in spot_symbols:
            continue  # not on Binance Spot either — skip
        tick = spot_tick.get(spot_sym, {})
        rows.append({
            "symbol": spot_sym,
            "base": base_upper,
            "name": cg.get("name", base_upper),
            "exchange": "binance_spot",
            "has_perp": False,
            "cg_rank": cg.get("cg_rank", 9999),
            "market_cap_usd": cg.get("market_cap_usd", 0.0),
            "price_usd": tick.get("price_usd") or cg.get("price_usd", 0.0),
            "volume_24h_usd": tick.get("volume_24h_usd", 0.0),
        })

    df = pd.DataFrame(rows)
    df = df.drop_duplicates(subset=["symbol"])
    df = df.sort_values("cg_rank").reset_index(drop=True)
    df["updated_at"] = datetime.now(timezone.utc).isoformat()

    log.info(
        "Universe built: %d symbols (%d futures + %d spot) in %.1fs",
        len(df),
        (df["has_perp"] == True).sum(),
        (df["has_perp"] == False).sum(),
        time.monotonic() - t0,
    )

    if save:
        _BASE_DIR.mkdir(parents=True, exist_ok=True)
        df.to_parquet(_UNIVERSE_PATH, index=False, compression="zstd")
        log.info("Saved → %s", _UNIVERSE_PATH)

    return df


def load_universe(max_age_s: int = _REFRESH_TTL_S) -> pd.DataFrame | None:
    """Load universe from parquet. Returns None if missing or too old."""
    if not _UNIVERSE_PATH.exists():
        return None
    age = time.time() - _UNIVERSE_PATH.stat().st_mtime
    if age > max_age_s:
        return None
    return pd.read_parquet(_UNIVERSE_PATH)


def get_universe_sync(force_refresh: bool = False) -> pd.DataFrame:
    """Synchronous wrapper. Builds if missing or stale."""
    if not force_refresh:
        cached = load_universe()
        if cached is not None:
            return cached
    # If already inside a running event loop (e.g. called from asyncio.run context),
    # fall back to cached parquet to avoid RuntimeError from nested asyncio.run()
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not None:
        cached = load_universe()
        if cached is not None:
            return cached
        raise RuntimeError("Cannot rebuild universe from within a running event loop. Run pipeline_1000 universe first.")
    return asyncio.run(build_universe())
