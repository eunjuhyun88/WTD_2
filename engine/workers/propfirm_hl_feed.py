"""PropFirm HL market feed worker — W-PF-102

Subscribes to Hyperliquid WebSocket l2Book for BTC/ETH/SOL and writes
mid prices to Redis: propfirm:mid:{SYMBOL}  (TTL 30s)

Runs as APScheduler background task (started once at lifespan).
Falls back gracefully if Redis or HL WebSocket is unavailable.

Key: propfirm:mid:BTC → "65432.10"
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

log = logging.getLogger("engine.propfirm.hl_feed")

SYMBOLS = ("BTC", "ETH", "SOL")
_REDIS_TTL = 30  # seconds — stale price detection

# HL WebSocket endpoint
_HL_WS_URL = "wss://api.hyperliquid.xyz/ws"


async def write_mid(symbol: str, price: float) -> None:
    """Write mid price to Redis with TTL."""
    try:
        from cache.kline_cache import _pool as redis_pool  # type: ignore[import]
        if redis_pool is None:
            return
        key = f"propfirm:mid:{symbol.upper()}"
        await redis_pool.setex(key, _REDIS_TTL, str(price))
    except Exception as exc:
        log.debug("hl_feed: redis write failed for %s: %s", symbol, exc)


async def get_mid(symbol: str) -> float | None:
    """Read cached mid price. Returns None if stale or unavailable."""
    try:
        from cache.kline_cache import _pool as redis_pool  # type: ignore[import]
        if redis_pool is None:
            return None
        val = await redis_pool.get(f"propfirm:mid:{symbol.upper()}")
        return float(val) if val else None
    except Exception:
        return None


async def run_feed_once() -> dict[str, float]:
    """Fetch current mid prices from HL REST API (one-shot for polling mode).

    Used by APScheduler every 10s when WebSocket is not running.
    Returns {symbol: mid_price}.
    """
    import aiohttp  # type: ignore[import]
    results: dict[str, float] = {}
    try:
        url = "https://api.hyperliquid.xyz/info"
        payload = {"type": "allMids"}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status != 200:
                    log.warning("hl_feed: allMids status %s", resp.status)
                    return results
                data: dict[str, str] = await resp.json()
                for sym in SYMBOLS:
                    coin_key = f"{sym}"
                    if coin_key in data:
                        try:
                            mid = float(data[coin_key])
                            results[sym] = mid
                            await write_mid(sym, mid)
                        except (ValueError, KeyError):
                            pass
    except Exception as exc:
        log.warning("hl_feed: REST fetch failed: %s", exc)
    return results


async def run_ws_feed() -> None:
    """Long-running WebSocket feed. Reconnects on disconnect.

    Intended to run as a background task during engine lifespan.
    """
    try:
        import websockets  # type: ignore[import]
    except ImportError:
        log.warning("hl_feed: websockets not installed — falling back to polling")
        return

    sub_msg = json.dumps({
        "method": "subscribe",
        "subscription": {"type": "allMids"},
    })

    while True:
        try:
            async with websockets.connect(_HL_WS_URL, ping_interval=20) as ws:
                await ws.send(sub_msg)
                log.info("hl_feed: WebSocket connected")
                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                        if msg.get("channel") == "allMids":
                            mids: dict[str, str] = msg.get("data", {}).get("mids", {})
                            for sym in SYMBOLS:
                                if sym in mids:
                                    await write_mid(sym, float(mids[sym]))
                    except Exception as exc:
                        log.debug("hl_feed: parse error: %s", exc)
        except Exception as exc:
            log.warning("hl_feed: WebSocket disconnected (%s) — reconnecting in 5s", exc)
            await asyncio.sleep(5)


def schedule_polling(scheduler: Any) -> None:
    """Register 10-second polling job on APScheduler instance."""
    scheduler.add_job(
        run_feed_once,
        "interval",
        seconds=10,
        id="propfirm_hl_feed",
        replace_existing=True,
        max_instances=1,
    )
    log.info("hl_feed: polling job registered (10s interval)")
