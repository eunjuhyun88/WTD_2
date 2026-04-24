"""Token blacklist — Redis-backed revocation for logout.

When a user logs out, the token's JTI (or sub:exp fallback) is stored
in Redis with TTL equal to the token's remaining validity window.
On every protected request, validate() checks the blacklist before
returning the user_id.

Redis key schema:
    jwt:revoked:{jti}          → "1"  (TTL = remaining token lifetime)

If Redis is unavailable the blacklist check is skipped with a warning
(availability beats security for this tier — see P2 roadmap for Redis HA).
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger(__name__)


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

    Returns True if stored, False if Redis unavailable (soft failure).
    """
    pool = _get_pool()
    if pool is None:
        log.warning(json.dumps({
            "event": "blacklist.redis_unavailable",
            "action": "revoke_skipped",
        }))
        return False

    now = datetime.now(timezone.utc).timestamp()
    exp = payload.get("exp", 0)
    ttl = max(1, math.ceil(exp - now))
    jti = _token_jti(payload)

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
        }))
        return False


async def is_revoked(payload: dict[str, Any]) -> bool:
    """Return True if the token has been revoked.

    Returns False (not revoked) if Redis is unavailable — soft failure.
    """
    pool = _get_pool()
    if pool is None:
        return False

    jti = _token_jti(payload)
    try:
        result = await pool.get(_revoke_key(jti))
        return result is not None
    except Exception as exc:
        log.warning(json.dumps({
            "event": "blacklist.check_failed",
            "error": str(exc),
        }))
        return False  # fail-open: prefer availability
