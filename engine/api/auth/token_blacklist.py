"""Token blacklist — Redis-backed revocation for logout.

When a user logs out, the token's JTI (or sub:exp fallback) is stored
in Redis with TTL equal to the token's remaining validity window.
On every protected request, validate() checks the blacklist before
returning the user_id.

Redis key schema:
    jwt:revoked:{jti}          → "1"  (TTL = remaining token lifetime)

Failure strategy:
    revoke_token — always writes to in-memory LRU fallback first, then Redis.
    is_revoked   — checks in-memory first (fast path), then Redis.
    If Redis is down, memory catches tokens revoked on this process instance.
    Cross-instance coverage requires Redis HA (Sentinel/Cluster — P2 roadmap).
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import threading
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger(__name__)

_MEM_MAX = 500
_mem_blacklist: OrderedDict[str, float] = OrderedDict()  # jti → revoked_at epoch
_mem_lock = threading.Lock()


def _mem_revoke(jti: str) -> None:
    with _mem_lock:
        _mem_blacklist[jti] = datetime.now(timezone.utc).timestamp()
        _mem_blacklist.move_to_end(jti)
        if len(_mem_blacklist) > _MEM_MAX:
            _mem_blacklist.popitem(last=False)


def _mem_is_revoked(jti: str) -> bool:
    with _mem_lock:
        return jti in _mem_blacklist


def _get_pool() -> Any | None:
    """Return shared Redis pool from kline_cache (None if unavailable)."""
    try:
        from cache.kline_cache import _pool  # noqa: PLC0415
        return _pool
    except Exception:
        return None


def _revoke_key(jti: str) -> str:
    return f"jwt:revoked:{jti}"


def _token_jti(payload: dict[str, Any]) -> str:
    """Extract or derive a stable per-token identifier."""
    if "jti" in payload:
        return str(payload["jti"])
    # Fallback: hash of sub + exp — unique per token issuance
    raw = f"{payload.get('sub', '')}:{payload.get('exp', 0)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


async def revoke_token(payload: dict[str, Any]) -> bool:
    """Mark a token as revoked.

    Always writes to in-memory fallback first so the revocation is visible
    even when Redis is unavailable. Returns True if Redis also succeeded.
    """
    jti = _token_jti(payload)
    _mem_revoke(jti)  # always — survives Redis outage for this instance

    pool = _get_pool()
    if pool is None:
        log.warning(json.dumps({
            "event": "blacklist.redis_unavailable",
            "action": "revoke_memory_only",
            "jti": jti,
        }))
        return False

    now = datetime.now(timezone.utc).timestamp()
    exp = payload.get("exp", 0)
    ttl = max(1, math.ceil(exp - now))

    try:
        await pool.set(_revoke_key(jti), "1", ex=ttl)
        log.info(json.dumps({
            "event": "blacklist.token_revoked",
            "jti": jti,
            "ttl_seconds": ttl,
        }))
        return True
    except Exception as exc:
        log.warning(json.dumps({
            "event": "blacklist.revoke_failed",
            "error": str(exc),
            "jti": jti,
            "note": "memory-only revocation in effect",
        }))
        return False


async def is_revoked(payload: dict[str, Any]) -> bool:
    """Return True if the token has been revoked.

    Checks in-memory cache first (zero-latency), then Redis.
    If Redis is unavailable, falls back to memory-only result.
    """
    jti = _token_jti(payload)

    if _mem_is_revoked(jti):  # fast path — no network
        return True

    pool = _get_pool()
    if pool is None:
        return False  # memory miss + no Redis: not revoked on this instance

    try:
        result = await pool.exists(_revoke_key(jti))
        return bool(result)
    except Exception as exc:
        log.warning(json.dumps({
            "event": "blacklist.check_failed",
            "error": str(exc),
            "note": "falling back to in-memory result",
        }))
        return False  # Redis error: fall back to memory (already checked above)
