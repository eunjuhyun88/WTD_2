"""GlobalCtx in-memory cache with 10-minute TTL.

L0 데이터를 비동기로 수집하여 GlobalCtx 싱글톤에 저장.
on-demand /deep 호출 시 이 캐시를 사용 → 4개 레이어(onchain, fg, kimchi, sector) 정상화.

Sources (all free, no auth):
  - alternative.me        → fear_greed (0-100)
  - open.er-api.com       → USD/KRW exchange rate
  - api.upbit.com         → KRW ticker prices
  - api.bithumb.com       → KRW ticker prices (fallback)
  - blockchain.info/stats → BTC on-chain (n_tx, avg_val, whale_sig)
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

from cache.http_client import get_client
from market_engine.types import GlobalCtx

log = logging.getLogger("engine.ctx_cache")

# ── Singleton state ────────────────────────────────────────────────────────
_ctx: GlobalCtx = GlobalCtx()
_last_refresh: float = 0.0          # monotonic seconds
_refresh_lock: asyncio.Lock | None = None
_REFRESH_INTERVAL = 600             # 10 minutes


def _get_lock() -> asyncio.Lock:
    """Lazy-init the lock inside the event loop."""
    global _refresh_lock
    if _refresh_lock is None:
        _refresh_lock = asyncio.Lock()
    return _refresh_lock


# ── Public API ─────────────────────────────────────────────────────────────

def get_cached_ctx() -> GlobalCtx:
    """Return the current cached GlobalCtx.

    May be empty (all defaults) if refresh has never been called.
    Always non-blocking — callers that need fresh data should await
    ensure_fresh_ctx() instead.
    """
    return _ctx


def is_stale() -> bool:
    """True if the cache is older than _REFRESH_INTERVAL or never filled."""
    return time.monotonic() - _last_refresh > _REFRESH_INTERVAL


def cache_summary() -> dict[str, Any]:
    """Diagnostic snapshot of the current cache state."""
    ctx = _ctx
    return {
        "fear_greed":     ctx.fear_greed,
        "usd_krw":        ctx.usd_krw,
        "upbit_count":    len(ctx.upbit_map),
        "bithumb_count":  len(ctx.bithumb_map),
        "onchain_keys":   list(ctx.btc_onchain.keys()),
        "sector_count":   len(ctx.sector_scores),
        "is_stale":       is_stale(),
        "age_seconds":    round(time.monotonic() - _last_refresh, 0) if _last_refresh else None,
    }


async def ensure_fresh_ctx() -> GlobalCtx:
    """Return the cached ctx; refresh in-place if stale.

    Non-blocking for the common case (fresh cache).
    Concurrent callers share the single in-flight refresh via asyncio.Lock.
    """
    if not is_stale():
        return _ctx
    return await refresh_global_ctx()


async def refresh_global_ctx() -> GlobalCtx:
    """Unconditionally refresh all L0 data and update the singleton.

    Safe to call from multiple concurrent coroutines — only one refresh
    runs at a time; others wait and return the freshly updated ctx.
    """
    global _ctx, _last_refresh

    lock = _get_lock()
    async with lock:
        # Re-check after acquiring lock (another coroutine may have refreshed)
        if not is_stale():
            return _ctx

        log.info("GlobalCtx refresh starting …")
        new_ctx = GlobalCtx()

        client = get_client()
        results = await asyncio.gather(
            _fetch_fear_greed(client, new_ctx),
            _fetch_krw_and_korean_prices(client, new_ctx),
            _fetch_btc_onchain(client, new_ctx),
            return_exceptions=True,
        )

        for r in results:
            if isinstance(r, Exception):
                log.warning("ctx_cache sub-fetch error: %s", r)

        _ctx = new_ctx
        _last_refresh = time.monotonic()

        log.info(
            "GlobalCtx refreshed — fg=%s usd_krw=%s upbit=%d onchain=%s",
            new_ctx.fear_greed,
            new_ctx.usd_krw,
            len(new_ctx.upbit_map),
            list(new_ctx.btc_onchain.keys()),
        )
    return _ctx


# ── Sub-fetchers ───────────────────────────────────────────────────────────

async def _fetch_fear_greed(client: httpx.AsyncClient, ctx: GlobalCtx) -> None:
    """alternative.me Fear & Greed Index — latest value (0 = extreme fear)."""
    try:
        r = await client.get(
            "https://api.alternative.me/fng/?limit=1&format=json",
            headers={"User-Agent": "cogochi-engine/ctx"},
        )
        r.raise_for_status()
        data = r.json()
        val = int(data["data"][0]["value"])
        ctx.fear_greed = val
        log.debug("fear_greed = %d", val)
    except Exception as exc:
        log.warning("fear_greed fetch failed: %s", exc)


async def _fetch_krw_and_korean_prices(
    client: httpx.AsyncClient, ctx: GlobalCtx,
) -> None:
    """Fetch USD/KRW rate + Upbit/Bithumb token prices."""
    # 1. USD/KRW exchange rate
    try:
        r = await client.get("https://open.er-api.com/v6/latest/USD")
        r.raise_for_status()
        ctx.usd_krw = float(r.json()["rates"]["KRW"])
        log.debug("usd_krw = %.2f", ctx.usd_krw)
    except Exception as exc:
        log.warning("usd_krw fetch failed: %s", exc)

    # 2. Upbit KRW market tickers
    _UPBIT_MARKETS = (
        "KRW-BTC,KRW-ETH,KRW-SOL,KRW-XRP,KRW-BNB,KRW-ADA,KRW-DOGE,"
        "KRW-AVAX,KRW-DOT,KRW-LINK,KRW-MATIC,KRW-TRX,KRW-SHIB,KRW-LTC,"
        "KRW-BCH,KRW-ATOM,KRW-FIL,KRW-ARB,KRW-OP,KRW-UNI,KRW-AAVE,"
        "KRW-SNX,KRW-COMP,KRW-EOS,KRW-XLM,KRW-ETC,KRW-ZEC,KRW-1INCH,"
        "KRW-SUSHI,KRW-FET,KRW-SUI,KRW-APT,KRW-NEAR,KRW-PEPE,KRW-TON"
    )
    try:
        r = await client.get(
            f"https://api.upbit.com/v1/ticker?markets={_UPBIT_MARKETS}",
            headers={"Accept": "application/json"},
        )
        r.raise_for_status()
        for item in r.json():
            base = item["market"].replace("KRW-", "")
            ctx.upbit_map[base] = float(item["trade_price"])
        log.debug("upbit_map: %d symbols", len(ctx.upbit_map))
    except Exception as exc:
        log.warning("upbit fetch failed: %s", exc)

    # 3. Bithumb KRW tickers (fallback / supplement)
    try:
        r = await client.get("https://api.bithumb.com/public/ticker/ALL_KRW")
        r.raise_for_status()
        payload = r.json().get("data", {})
        for sym, item in payload.items():
            if sym == "date":
                continue
            try:
                ctx.bithumb_map[sym] = float(item["closing_price"])
            except (KeyError, TypeError, ValueError):
                pass
        log.debug("bithumb_map: %d symbols", len(ctx.bithumb_map))
    except Exception as exc:
        log.warning("bithumb fetch failed: %s", exc)


async def _fetch_btc_onchain(
    client: httpx.AsyncClient, ctx: GlobalCtx,
) -> None:
    """Fetch BTC on-chain stats from blockchain.info/stats (free, no key)."""
    try:
        r = await client.get(
            "https://blockchain.info/stats?format=json",
            headers={"Accept": "application/json"},
        )
        r.raise_for_status()
        data = r.json()

        n_tx      = int(data.get("n_tx", 0))
        btc_sent  = float(data.get("total_btc_sent", 0)) / 1e8  # sat → BTC
        avg_val   = (btc_sent / n_tx) if n_tx > 0 else 0.0
        whale_sig = "HIGH" if avg_val > 2.0 else "MED" if avg_val > 0.8 else "LOW"

        ctx.btc_onchain = {
            "n_tx":          n_tx,
            "avg_tx_val":    round(avg_val, 4),
            "whale_sig":     whale_sig,
            "exchange_flow": "NORMAL",  # requires glassnode; default neutral
        }
        log.debug(
            "btc_onchain: n_tx=%d avg_val=%.4f whale=%s", n_tx, avg_val, whale_sig,
        )
    except Exception as exc:
        log.warning("btc_onchain fetch failed: %s", exc)
