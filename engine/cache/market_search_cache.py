"""Shared Redis cache for market search query results."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from threading import Lock
from typing import Any

log = logging.getLogger("engine.market_search_cache")

_RESULT_TTL_SECONDS = int(os.getenv("MARKET_SEARCH_SHARED_CACHE_TTL_SECONDS", "120"))
_GENERATION_TTL_SECONDS = int(os.getenv("MARKET_SEARCH_SHARED_GENERATION_TTL_SECONDS", "86400"))
_CLIENT_RETRY_COOLDOWN_SECONDS = float(os.getenv("MARKET_SEARCH_SHARED_CACHE_RETRY_SECONDS", "5"))
_BUILD_LOCK_TTL_SECONDS = int(os.getenv("MARKET_SEARCH_SHARED_BUILD_LOCK_TTL_SECONDS", "5"))
_BUILD_WAIT_TIMEOUT_SECONDS = float(os.getenv("MARKET_SEARCH_SHARED_BUILD_WAIT_SECONDS", "0.35"))
_BUILD_WAIT_POLL_SECONDS = float(os.getenv("MARKET_SEARCH_SHARED_BUILD_WAIT_POLL_SECONDS", "0.05"))

_client: Any = None
_client_retry_after_monotonic = 0.0
_client_lock = Lock()


def _redis_url() -> str:
    return os.getenv("REDIS_URL", "redis://redis:6379")


def _db_namespace(db_path: str) -> str:
    return hashlib.sha1(db_path.encode("utf-8")).hexdigest()[:12]


def _generation_key(db_path: str) -> str:
    return f"market-search:{_db_namespace(db_path)}:generation"


def _result_key(
    db_path: str,
    *,
    generation: str,
    normalized_query: str,
    limit: int,
    allow_live_fallback: bool,
) -> str:
    query_hash = hashlib.sha1(normalized_query.encode("utf-8")).hexdigest()[:16]
    live_flag = "live" if allow_live_fallback else "index"
    return f"market-search:{_db_namespace(db_path)}:{generation}:{live_flag}:{limit}:{query_hash}"


def _build_lock_key(
    db_path: str,
    *,
    generation: str,
    normalized_query: str,
    limit: int,
    allow_live_fallback: bool,
) -> str:
    query_hash = hashlib.sha1(normalized_query.encode("utf-8")).hexdigest()[:16]
    live_flag = "live" if allow_live_fallback else "index"
    return f"market-search:{_db_namespace(db_path)}:{generation}:build-lock:{live_flag}:{limit}:{query_hash}"


def _get_client() -> Any | None:
    global _client
    global _client_retry_after_monotonic

    now = time.monotonic()
    with _client_lock:
        if _client is not None:
            return _client
        if now < _client_retry_after_monotonic:
            return None
        try:
            import redis

            client = redis.Redis.from_url(
                _redis_url(),
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=0.2,
                socket_timeout=0.2,
                health_check_interval=30,
            )
            client.ping()
        except Exception as exc:
            _client = None
            _client_retry_after_monotonic = now + _CLIENT_RETRY_COOLDOWN_SECONDS
            log.debug("market search shared cache unavailable: %s", exc)
            return None

        _client = client
        return _client


def read_shared_search_results(
    *,
    db_path: str,
    normalized_query: str,
    limit: int,
    allow_live_fallback: bool,
) -> tuple[str | None, list[dict[str, object]] | None]:
    client = _get_client()
    if client is None:
        return None, None
    try:
        generation = str(client.get(_generation_key(db_path)) or "0")
        raw = client.get(
            _result_key(
                db_path,
                generation=generation,
                normalized_query=normalized_query,
                limit=limit,
                allow_live_fallback=allow_live_fallback,
            )
        )
        if raw is None:
            return generation, None
        payload = json.loads(raw)
        if not isinstance(payload, list):
            return generation, None
        return generation, payload
    except Exception as exc:
        log.debug("market search shared cache read failed: %s", exc)
        return None, None


def write_shared_search_results(
    *,
    db_path: str,
    normalized_query: str,
    limit: int,
    allow_live_fallback: bool,
    results: list[dict[str, object]],
    generation: str | None = None,
) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        generation_value = generation or str(client.get(_generation_key(db_path)) or "0")
        client.set(
            _result_key(
                db_path,
                generation=generation_value,
                normalized_query=normalized_query,
                limit=limit,
                allow_live_fallback=allow_live_fallback,
            ),
            json.dumps(results, separators=(",", ":"), sort_keys=True),
            ex=_RESULT_TTL_SECONDS,
        )
    except Exception as exc:
        log.debug("market search shared cache write failed: %s", exc)


def acquire_shared_query_build_lock(
    *,
    db_path: str,
    normalized_query: str,
    limit: int,
    allow_live_fallback: bool,
    generation: str | None = None,
) -> tuple[str | None, str | None]:
    client = _get_client()
    if client is None:
        return None, None
    try:
        generation_value = generation or str(client.get(_generation_key(db_path)) or "0")
        token = f"{os.getpid()}:{time.time_ns()}"
        acquired = client.set(
            _build_lock_key(
                db_path,
                generation=generation_value,
                normalized_query=normalized_query,
                limit=limit,
                allow_live_fallback=allow_live_fallback,
            ),
            token,
            nx=True,
            ex=_BUILD_LOCK_TTL_SECONDS,
        )
        return generation_value, token if acquired else None
    except Exception as exc:
        log.debug("market search shared build lock acquire failed: %s", exc)
        return None, None


def release_shared_query_build_lock(
    *,
    db_path: str,
    normalized_query: str,
    limit: int,
    allow_live_fallback: bool,
    generation: str,
    token: str,
) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        key = _build_lock_key(
            db_path,
            generation=generation,
            normalized_query=normalized_query,
            limit=limit,
            allow_live_fallback=allow_live_fallback,
        )
        if client.get(key) == token:
            client.delete(key)
    except Exception as exc:
        log.debug("market search shared build lock release failed: %s", exc)


def wait_for_shared_search_results(
    *,
    db_path: str,
    normalized_query: str,
    limit: int,
    allow_live_fallback: bool,
    max_wait_seconds: float | None = None,
) -> tuple[str | None, list[dict[str, object]] | None]:
    timeout = _BUILD_WAIT_TIMEOUT_SECONDS if max_wait_seconds is None else max_wait_seconds
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        generation, payload = read_shared_search_results(
            db_path=db_path,
            normalized_query=normalized_query,
            limit=limit,
            allow_live_fallback=allow_live_fallback,
        )
        if payload is not None:
            return generation, payload
        if generation is None:
            return None, None
        time.sleep(_BUILD_WAIT_POLL_SECONDS)
    return None, None


def bump_shared_search_generation(*, db_path: str) -> str | None:
    client = _get_client()
    if client is None:
        return None
    generation = str(int(time.time() * 1000))
    try:
        client.set(_generation_key(db_path), generation, ex=_GENERATION_TTL_SECONDS)
        return generation
    except Exception as exc:
        log.debug("market search shared cache generation bump failed: %s", exc)
        return None
