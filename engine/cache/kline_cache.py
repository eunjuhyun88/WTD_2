"""Redis kline cache — Redis-first OHLCV read/write layer.

Keys:   kline:{SYMBOL}:{TF}  →  JSON array of OHLCV rows
TTL:    per-timeframe (see KLINE_TTL)

Graceful degrade: if Redis is unavailable any call silently returns None
so the caller falls back to CSV + pandas (existing path).

Pool lifecycle: call init_pool() once at startup, close_pool() at shutdown.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

log = logging.getLogger("engine.kline_cache")

# ── TTL policy ─────────────────────────────────────────────────────────────

KLINE_TTL: dict[str, int] = {
    "1m":  60,
    "5m":  300,
    "15m": 600,
    "30m": 900,
    "1h":  1800,
    "2h":  3600,
    "4h":  3600,
    "6h":  7200,
    "12h": 7200,
    "1d":  14400,
    "1w":  86400,
}

_DEFAULT_TTL = 1800

# ── Connection pool (module-level singleton) ────────────────────────────────

_pool: Any = None  # redis.asyncio.Redis | None


def _redis_url() -> str:
    return os.getenv("REDIS_URL", "redis://redis:6379")


async def init_pool() -> None:
    """Create the async Redis connection pool. Call once at lifespan startup."""
    global _pool
    try:
        import redis.asyncio as aioredis  # type: ignore[import]
        _pool = aioredis.from_url(
            _redis_url(),
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        await _pool.ping()
        log.info("Redis pool connected: %s", _redis_url())
    except Exception as exc:
        log.warning("Redis unavailable — kline cache disabled: %s", exc)
        _pool = None


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        try:
            await _pool.aclose()
        except Exception:
            pass
        _pool = None


# ── Cache key ───────────────────────────────────────────────────────────────

def _key(symbol: str, tf: str) -> str:
    return f"kline:{symbol.upper()}:{tf}"


# ── Public API ──────────────────────────────────────────────────────────────

async def get_klines(symbol: str, tf: str) -> list[dict] | None:
    """Return cached OHLCV rows or None on miss / Redis unavailable."""
    if _pool is None:
        return None
    try:
        raw = await _pool.get(_key(symbol, tf))
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        log.debug("kline_cache.get error (%s/%s): %s", symbol, tf, exc)
        return None


async def set_klines(symbol: str, tf: str, rows: list[dict]) -> None:
    """Write OHLCV rows to Redis with per-TF TTL. No-op if Redis unavailable."""
    if _pool is None:
        return
    ttl = KLINE_TTL.get(tf, _DEFAULT_TTL)
    try:
        await _pool.set(_key(symbol, tf), json.dumps(rows), ex=ttl)
        log.debug("kline_cache.set %s/%s → %d rows TTL=%ds", symbol, tf, len(rows), ttl)
    except Exception as exc:
        log.debug("kline_cache.set error (%s/%s): %s", symbol, tf, exc)


async def invalidate(symbol: str, tf: str) -> None:
    """Delete a single cached entry."""
    if _pool is None:
        return
    try:
        await _pool.delete(_key(symbol, tf))
    except Exception:
        pass


def is_connected() -> bool:
    return _pool is not None
