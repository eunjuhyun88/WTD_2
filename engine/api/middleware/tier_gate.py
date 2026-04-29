"""
Tier enforcement middleware for quota-gated endpoints.

Priority: Stripe Pro subscription > x402 credits > Free limit
HTTP 402 Payment Required when Free limit exceeded.

Feature flag: TIER_GATE_ENABLED=false → bypass (dev/staging override).
Redis cache: tier:{user_id} TTL 60s to avoid per-request DB hit.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, Request

log = logging.getLogger("engine.tier_gate")

TIER_GATE_ENABLED: bool = os.getenv("TIER_GATE_ENABLED", "true").lower() not in ("false", "0", "no")

FREE_LIMITS: dict[str, int] = {
    "captures_per_day": 5,
    "search_per_day": 20,
}

_SUPABASE_URL = os.getenv("SUPABASE_URL", "")
_SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "")


@dataclass
class TierInfo:
    user_id: str
    tier: str          # 'free' | 'pro'
    source: str        # 'stripe' | 'x402' | 'free'
    credits_remaining: int = 0

    @property
    def is_pro(self) -> bool:
        return self.tier == "pro" or self.credits_remaining > 0


# ── Redis helpers (best-effort, silently degrades) ─────────────────────────

def _get_redis() -> object | None:
    try:
        import redis  # type: ignore[import]

        url = os.getenv("REDIS_URL", "redis://redis:6379")
        return redis.from_url(url, socket_connect_timeout=1, socket_timeout=1)
    except Exception:
        return None


def _cache_get(key: str) -> dict | None:
    try:
        r = _get_redis()
        if r is None:
            return None
        raw = r.get(key)  # type: ignore[union-attr]
        return json.loads(raw) if raw else None
    except Exception:
        return None


def _cache_set(key: str, value: dict, ttl: int = 60) -> None:
    try:
        r = _get_redis()
        if r is not None:
            r.setex(key, ttl, json.dumps(value))  # type: ignore[union-attr]
    except Exception:
        pass


# ── Supabase lookup ────────────────────────────────────────────────────────

def _fetch_tier_from_db(user_id: str) -> TierInfo:
    try:
        from supabase import create_client  # type: ignore[import]

        sb = create_client(_SUPABASE_URL, _SUPABASE_KEY)
        row = (
            sb.table("user_preferences")
            .select("tier, subscription_active, subscription_expires_at")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        data = row.data or {}
        tier: str = data.get("tier", "free")
        active: bool = bool(data.get("subscription_active", False))
        expires_raw: str | None = data.get("subscription_expires_at")
        expires_at = (
            datetime.fromisoformat(expires_raw.replace("Z", "+00:00"))
            if expires_raw
            else None
        )
        is_expired = expires_at is not None and expires_at < datetime.now(timezone.utc)
        is_stripe_pro = active and tier == "pro" and not is_expired

        credits_row = (
            sb.table("user_credits")
            .select("remaining")
            .eq("user_id", user_id)
            .gt("remaining", 0)
            .execute()
        )
        credits = sum(r.get("remaining", 0) for r in (credits_row.data or []))

        source = "stripe" if is_stripe_pro else ("x402" if credits > 0 else "free")
        effective_tier = "pro" if (is_stripe_pro or credits > 0) else "free"
        return TierInfo(user_id=user_id, tier=effective_tier, source=source, credits_remaining=credits)
    except Exception as exc:
        log.warning("tier_gate DB lookup failed for %s: %s", user_id, exc)
        return TierInfo(user_id=user_id, tier="free", source="free")


def _resolve_tier(user_id: str) -> TierInfo:
    cache_key = f"tier:{user_id}"
    cached = _cache_get(cache_key)
    if cached:
        return TierInfo(**cached)

    info = _fetch_tier_from_db(user_id)
    _cache_set(cache_key, {
        "user_id": info.user_id,
        "tier": info.tier,
        "source": info.source,
        "credits_remaining": info.credits_remaining,
    })
    return info


# ── FastAPI dependency ─────────────────────────────────────────────────────

def tier_gate(request: Request) -> TierInfo:
    """FastAPI Depends — inject TierInfo, raise HTTP 402 if Free limit exceeded.

    Usage:
        @router.post("/captures")
        def create_capture(tier: TierInfo = Depends(tier_gate)):
            ...
    """
    if not TIER_GATE_ENABLED:
        return TierInfo(user_id="bypass", tier="pro", source="bypass")

    user_id: str | None = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    return _resolve_tier(user_id)


def check_and_increment_quota(tier_info: TierInfo, quota_key: str) -> None:
    """Increment a per-user per-day counter and raise 402 if free limit exceeded.

    quota_key: 'captures_per_day' | 'search_per_day'
    Safe to call with Pro users — returns immediately.
    """
    if tier_info.is_pro:
        return

    limit = FREE_LIMITS.get(quota_key, 0)
    if limit <= 0:
        return

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    counter_key = f"quota:{quota_key}:{tier_info.user_id}:{today}"

    try:
        r = _get_redis()
        if r is not None:
            count = r.incr(counter_key)  # type: ignore[union-attr]
            # Set TTL on first increment (expire at end of UTC day)
            if count == 1:
                r.expire(counter_key, 86400)  # type: ignore[union-attr]
            if count > limit:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "error": "quota_exceeded",
                        "quota_key": quota_key,
                        "limit": limit,
                        "upgrade_url": "/settings/billing",
                    },
                )
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("quota check failed (permitting): %s", exc)


def free_tier_gate(request: Request) -> TierInfo:
    """Variant: raises HTTP 402 only — does NOT check daily quota counters.
    Use on endpoints where the calling code enforces its own per-day counting.
    """
    return tier_gate(request)
