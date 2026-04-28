"""F-3: Verdict deep-link token signing.

Standalone module — no DB access, no FastAPI dependency.
Importable from both api/routes/captures.py and scanner/alerts_pattern.py
without circular import.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Optional

log = logging.getLogger(__name__)

_DEFAULT_TTL_SECONDS = 72 * 3600  # 72 hours


def sign_verdict_token(
    capture_id: str,
    symbol: str,
    pattern_slug: str,
    *,
    ttl_seconds: int = _DEFAULT_TTL_SECONDS,
) -> Optional[str]:
    """Sign a verdict deep-link token (HMAC-SHA256, stateless).

    Returns None if VERDICT_LINK_SECRET is not configured — callers should
    degrade gracefully (send alert without URL).

    Token format: base64url(payload_json) + "." + hex(hmac_sha256)
    """
    secret = os.environ.get("VERDICT_LINK_SECRET", "")
    if not secret:
        log.debug("VERDICT_LINK_SECRET not set — skipping token generation for %s", capture_id)
        return None

    expires_at = int(time.time()) + ttl_seconds
    payload = {
        "capture_id": capture_id,
        "symbol": symbol,
        "pattern_slug": pattern_slug,
        "expires_at": expires_at,
    }
    payload_b64 = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).decode()
    sig = hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def verdict_deeplink_url(token: str) -> str:
    """Build the full /verdict?token=... URL from a signed token."""
    app_origin = os.environ.get("APP_ORIGIN", "https://cogochi.app")
    return f"{app_origin}/verdict?token={token}"
