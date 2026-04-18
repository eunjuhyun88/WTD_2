"""Singleton httpx.AsyncClient pool for the engine.

All engine code that needs to make HTTP calls should use get_client()
instead of creating AsyncClient per-request. This amortises TCP handshakes,
TLS negotiation, and keepalive connections across all concurrent requests.

Lifecycle: call init_client() once in lifespan startup, close_client() at shutdown.
"""
from __future__ import annotations

import logging

import httpx

log = logging.getLogger("engine.http_client")

_client: httpx.AsyncClient | None = None

_DEFAULT_TIMEOUT = httpx.Timeout(connect=4.0, read=10.0, write=5.0, pool=2.0)
_DEFAULT_LIMITS = httpx.Limits(
    max_connections=100,
    max_keepalive_connections=30,
    keepalive_expiry=30.0,
)


async def init_client(
    timeout: httpx.Timeout | None = None,
    limits: httpx.Limits | None = None,
) -> None:
    """Create the shared AsyncClient. Call once at lifespan startup."""
    global _client
    _client = httpx.AsyncClient(
        timeout=timeout or _DEFAULT_TIMEOUT,
        limits=limits or _DEFAULT_LIMITS,
        follow_redirects=True,
        headers={"User-Agent": "cogochi-engine/0.2"},
    )
    log.info("httpx singleton pool initialised (max_conn=%d)", _DEFAULT_LIMITS.max_connections)


async def close_client() -> None:
    """Close the shared AsyncClient. Call at lifespan shutdown."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
        log.info("httpx singleton pool closed")


def get_client() -> httpx.AsyncClient:
    """Return the shared client.

    Falls back to creating a temporary client if called before init_client()
    (e.g. in tests or CLI scripts) so callers never need to guard for None.
    """
    if _client is not None:
        return _client
    log.debug("http_client not initialised — creating temporary client")
    return httpx.AsyncClient(
        timeout=_DEFAULT_TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": "cogochi-engine/0.2"},
    )
