"""JWT validation middleware for user authentication.

Verifies JWT tokens from app client, extracts user_id, and injects into request state.

Security stack:
- P0: JWKS caching (1h TTL) + circuit breaker + graceful degradation
- P1: RS256 signature verification via PyJWT + JWKS
- P1: Structured JSON logging + observability metrics
- P2: Token blacklist integration (see token_blacklist.py)

Config (env vars):
    JWT_JWKS_URL   : Supabase JWKS URL (required)
    JWT_AUDIENCE   : expected audience claim, e.g. "authenticated"
    JWT_ISSUER     : expected issuer, e.g. "https://<project>.supabase.co/auth/v1"
    JWT_SKIP_SIG   : "true" to skip RS256 check (test/preview only — never production)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import httpx
import jwt as pyjwt
from jwt.algorithms import RSAAlgorithm
from fastapi import HTTPException, Request

from observability.metrics import increment, observe_ms
from api.auth.token_blacklist import is_revoked

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Structured log helpers
# ---------------------------------------------------------------------------

def _log_event(level: int, event: str, **fields: Any) -> None:
    """Emit a structured JSON log line."""
    payload = {"event": event, "ts": datetime.now(timezone.utc).isoformat(), **fields}
    log.log(level, json.dumps(payload))


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------

class CircuitState(str, Enum):
    CLOSED = "closed"       # Normal — JWKS fetched from endpoint
    OPEN = "open"           # Endpoint down — all fetches rejected
    HALF_OPEN = "half_open" # Testing recovery


class JWKSCache:
    """In-memory JWKS cache with TTL and asyncio.Lock for concurrent safety."""

    def __init__(self, ttl_seconds: int = 3600):
        self.ttl_seconds = ttl_seconds
        self.data: dict[str, Any] | None = None
        self._stale: dict[str, Any] | None = None  # last known good — used for degradation
        self.expires_at: float = 0
        self.lock = asyncio.Lock()

    async def get(self) -> dict[str, Any] | None:
        if self.data is None:
            return None
        if datetime.now(timezone.utc).timestamp() >= self.expires_at:
            self.data = None
            return None
        return self.data

    async def get_stale(self) -> dict[str, Any] | None:
        """Return last known good JWKS regardless of TTL."""
        return self._stale

    async def set(self, data: dict[str, Any]) -> None:
        async with self.lock:
            now = datetime.now(timezone.utc).timestamp()
            self.data = data
            self._stale = data
            self.expires_at = now + self.ttl_seconds

    async def invalidate(self) -> None:
        async with self.lock:
            self.data = None
            self.expires_at = 0


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------

class JWTValidator:
    """RS256-verified JWT validator with JWKS caching + circuit breaker."""

    def __init__(self) -> None:
        self.jwks_url = os.getenv("JWT_JWKS_URL", "").strip()
        self.audience = os.getenv("JWT_AUDIENCE", "authenticated").strip()
        self.issuer = os.getenv("JWT_ISSUER", "").strip()
        self._skip_sig = os.getenv("JWT_SKIP_SIG", "").lower() in {"1", "true", "yes"}

        self._jwks_cache = JWKSCache(ttl_seconds=3600)

        self._circuit_state = CircuitState.CLOSED
        self._circuit_failure_count = 0
        self._circuit_failure_threshold = 5
        self._circuit_timeout_seconds = 60
        self._circuit_last_failure_time = 0.0

        if self._skip_sig:
            _log_event(logging.WARNING, "jwt.sig_skip_enabled",
                       note="RS256 signature verification is DISABLED — not safe for production")

    # ------------------------------------------------------------------
    # JWKS fetch with caching + circuit breaker
    # ------------------------------------------------------------------

    async def get_jwks(self) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc).timestamp()

        # Circuit breaker: OPEN → maybe transition to HALF_OPEN
        if self._circuit_state == CircuitState.OPEN:
            if now >= self._circuit_last_failure_time + self._circuit_timeout_seconds:
                self._circuit_state = CircuitState.HALF_OPEN
                _log_event(logging.INFO, "jwt.circuit_transition",
                           from_state="OPEN", to_state="HALF_OPEN")
                increment("jwt.circuit.half_open")
            else:
                increment("jwt.circuit.open_reject")
                # Graceful degradation: return stale cache
                stale = await self._jwks_cache.get_stale()
                if stale:
                    increment("jwt.cache.stale_hit")
                    return stale
                return None

        # Cache hit
        cached = await self._jwks_cache.get()
        if cached is not None:
            increment("jwt.cache.hit")
            return cached

        if not self.jwks_url:
            _log_event(logging.ERROR, "jwt.jwks_url_missing")
            increment("jwt.error.no_jwks_url")
            return None

        # Fetch from endpoint
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(self.jwks_url)
                resp.raise_for_status()
                jwks = resp.json()

            elapsed_ms = (time.perf_counter() - t0) * 1000
            observe_ms("jwt.jwks_fetch_ms", elapsed_ms)
            increment("jwt.cache.miss")

            await self._jwks_cache.set(jwks)

            if self._circuit_state == CircuitState.HALF_OPEN:
                self._circuit_state = CircuitState.CLOSED
                self._circuit_failure_count = 0
                _log_event(logging.INFO, "jwt.circuit_transition",
                           from_state="HALF_OPEN", to_state="CLOSED")
                increment("jwt.circuit.recovered")

            return jwks

        except httpx.HTTPError as exc:
            elapsed_ms = (time.perf_counter() - t0) * 1000
            observe_ms("jwt.jwks_fetch_ms", elapsed_ms)
            self._circuit_failure_count += 1
            self._circuit_last_failure_time = now
            increment("jwt.jwks_fetch_error")

            _log_event(logging.ERROR, "jwt.jwks_fetch_failed",
                       attempt=self._circuit_failure_count,
                       threshold=self._circuit_failure_threshold,
                       error=str(exc))

            if self._circuit_failure_count >= self._circuit_failure_threshold:
                prev = self._circuit_state.value
                self._circuit_state = CircuitState.OPEN
                _log_event(logging.ERROR, "jwt.circuit_transition",
                           from_state=prev, to_state="OPEN",
                           failure_count=self._circuit_failure_count)
                increment("jwt.circuit.opened")

            # Graceful degradation: stale cache
            stale = await self._jwks_cache.get_stale()
            if stale:
                _log_event(logging.WARNING, "jwt.stale_cache_fallback")
                increment("jwt.cache.stale_hit")
                return stale

            return None

    # ------------------------------------------------------------------
    # RS256 signature verification
    # ------------------------------------------------------------------

    def _get_public_key(self, token: str, jwks: dict[str, Any]) -> Any:
        """Extract RSA public key matching this token's kid from JWKS."""
        try:
            header = pyjwt.get_unverified_header(token)
        except pyjwt.exceptions.DecodeError as exc:
            raise ValueError(f"Cannot decode JWT header: {exc}") from exc

        kid = header.get("kid")
        alg = header.get("alg", "RS256")

        if alg not in {"RS256", "RS384", "RS512"}:
            raise ValueError(f"Unsupported algorithm: {alg}")

        keys = jwks.get("keys", [])
        for key_data in keys:
            if not kid or key_data.get("kid") == kid:
                return RSAAlgorithm.from_jwk(key_data)

        raise ValueError(f"No JWKS key matched kid={kid!r} (available: {[k.get('kid') for k in keys]})")

    # ------------------------------------------------------------------
    # Main validate entry point
    # ------------------------------------------------------------------

    async def validate(self, token: str) -> str:
        """Validate JWT and return user_id (sub claim).

        Raises:
            HTTPException 401 — missing / malformed token
            HTTPException 403 — expired / revoked token
            HTTPException 503 — JWKS unavailable (circuit OPEN, no stale cache)
        """
        if not token:
            raise HTTPException(status_code=401, detail="Missing authorization token")

        if token.startswith("Bearer "):
            token = token[7:]

        t0 = time.perf_counter()
        try:
            if self._skip_sig:
                # Preview / test path — no signature check
                user_id = self._decode_unverified(token)
            else:
                jwks = await self.get_jwks()
                if jwks is None:
                    _log_event(logging.ERROR, "jwt.validate_no_jwks")
                    increment("jwt.error.no_jwks")
                    raise HTTPException(
                        status_code=503,
                        detail="Auth service temporarily unavailable — please retry",
                    )

                public_key = self._get_public_key(token, jwks)
                decode_kwargs: dict[str, Any] = {
                    "algorithms": ["RS256", "RS384", "RS512"],
                }
                if self.audience:
                    decode_kwargs["audience"] = self.audience
                if self.issuer:
                    decode_kwargs["issuer"] = self.issuer

                payload = pyjwt.decode(token, public_key, **decode_kwargs)
                user_id = payload.get("sub")
                if not user_id:
                    raise ValueError("JWT has no 'sub' claim")

                # Blacklist check (logout revocation)
                if await is_revoked(payload):
                    increment("jwt.validate.revoked")
                    _log_event(logging.WARNING, "jwt.token_revoked", sub=user_id)
                    raise HTTPException(status_code=403, detail="Token has been revoked")

            elapsed_ms = (time.perf_counter() - t0) * 1000
            observe_ms("jwt.validate_ms", elapsed_ms)
            increment("jwt.validate.ok")
            return user_id

        except HTTPException:
            raise
        except pyjwt.exceptions.ExpiredSignatureError as exc:
            increment("jwt.validate.expired")
            _log_event(logging.WARNING, "jwt.token_expired")
            raise HTTPException(status_code=403, detail="Token expired") from exc
        except pyjwt.exceptions.InvalidAudienceError as exc:
            increment("jwt.validate.bad_audience")
            _log_event(logging.WARNING, "jwt.bad_audience")
            raise HTTPException(status_code=403, detail="Invalid token audience") from exc
        except pyjwt.exceptions.InvalidIssuerError as exc:
            increment("jwt.validate.bad_issuer")
            _log_event(logging.WARNING, "jwt.bad_issuer")
            raise HTTPException(status_code=403, detail="Invalid token issuer") from exc
        except pyjwt.exceptions.DecodeError as exc:
            increment("jwt.validate.decode_error")
            _log_event(logging.WARNING, "jwt.decode_error", error=str(exc))
            raise HTTPException(status_code=401, detail="Invalid JWT token") from exc
        except ValueError as exc:
            increment("jwt.validate.invalid")
            _log_event(logging.WARNING, "jwt.invalid", error=str(exc))
            raise HTTPException(status_code=401, detail="Invalid JWT token") from exc
        except Exception as exc:
            increment("jwt.validate.unexpected_error")
            _log_event(logging.ERROR, "jwt.unexpected_error", error=str(exc))
            raise HTTPException(status_code=500, detail="Token validation error") from exc

    def _decode_unverified(self, token: str) -> str:
        """Decode without signature check — only for JWT_SKIP_SIG=true (test/preview)."""
        payload = pyjwt.decode(token, options={"verify_signature": False})
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("JWT has no 'sub' claim")
        return user_id


# ---------------------------------------------------------------------------
# Global singleton
# ---------------------------------------------------------------------------

_jwt_validator = JWTValidator()


async def extract_user_id_from_jwt(request: Request) -> str | None:
    """Extract and validate user_id from Authorization header.

    Returns None if no Authorization header present.
    Raises HTTPException if header is present but invalid.
    """
    auth_header = request.headers.get("Authorization", "").strip()
    if not auth_header:
        return None
    token = auth_header[7:] if auth_header.startswith("Bearer ") else auth_header
    if not token:
        return None
    return await _jwt_validator.validate(token)


def get_validator() -> JWTValidator:
    """Return the global JWTValidator instance (for logout/blacklist)."""
    return _jwt_validator


def is_protected_route(path: str) -> bool:
    """True if route requires JWT authentication.

    Public (no JWT):
        /healthz, /readyz — health checks
        /jobs/*           — internal scheduler (ENGINE_INTERNAL_SECRET)
        /metrics          — internal observability
    """
    # /auth/logout handles its own token extraction (no middleware needed)
    public_prefixes = ("/healthz", "/readyz", "/jobs/", "/metrics", "/auth/logout")
    return not any(path.startswith(p) for p in public_prefixes)
