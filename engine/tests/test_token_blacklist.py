"""Tests for token_blacklist in-memory fallback (W-0408)."""
from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from api.auth.token_blacklist import (
    _mem_blacklist,
    _mem_is_revoked,
    _mem_revoke,
    _token_jti,
    is_revoked,
    revoke_token,
)

PAYLOAD = {"sub": "user-abc", "exp": int(time.time()) + 3600, "jti": "test-jti-001"}
PAYLOAD_NO_JTI = {"sub": "user-xyz", "exp": int(time.time()) + 3600}


def _clear_mem():
    _mem_blacklist.clear()


# ---------------------------------------------------------------------------
# Unit: in-memory helpers
# ---------------------------------------------------------------------------

def test_mem_revoke_stores_jti():
    _clear_mem()
    _mem_revoke("jti-a")
    assert _mem_is_revoked("jti-a")


def test_mem_is_revoked_unknown_returns_false():
    _clear_mem()
    assert not _mem_is_revoked("jti-unknown")


def test_mem_revoke_lru_eviction():
    _clear_mem()
    from api.auth import token_blacklist
    original_max = token_blacklist._MEM_MAX
    token_blacklist._MEM_MAX = 3

    try:
        _mem_revoke("j1")
        _mem_revoke("j2")
        _mem_revoke("j3")
        _mem_revoke("j4")  # triggers eviction of j1
        assert not _mem_is_revoked("j1"), "oldest entry should be evicted"
        assert _mem_is_revoked("j2")
        assert _mem_is_revoked("j3")
        assert _mem_is_revoked("j4")
    finally:
        token_blacklist._MEM_MAX = original_max
        _clear_mem()


def test_token_jti_uses_jti_field():
    jti = _token_jti({"jti": "explicit-jti", "sub": "u", "exp": 9999})
    assert jti == "explicit-jti"


def test_token_jti_fallback_is_deterministic():
    p = {"sub": "user-a", "exp": 1234567890}
    assert _token_jti(p) == _token_jti(p)


def test_token_jti_fallback_differs_by_sub_or_exp():
    p1 = {"sub": "user-a", "exp": 1000}
    p2 = {"sub": "user-b", "exp": 1000}
    assert _token_jti(p1) != _token_jti(p2)


# ---------------------------------------------------------------------------
# Integration: revoke_token writes to memory regardless of Redis
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_revoke_token_writes_memory_even_when_redis_unavailable():
    _clear_mem()
    with patch("api.auth.token_blacklist._get_pool", return_value=None):
        result = await revoke_token(PAYLOAD)
    assert result is False  # Redis unavailable → returns False
    assert _mem_is_revoked(_token_jti(PAYLOAD)), "must be in memory despite Redis down"


@pytest.mark.asyncio
async def test_revoke_token_writes_memory_and_redis_when_both_available():
    _clear_mem()
    pool = AsyncMock()
    pool.set = AsyncMock()
    with patch("api.auth.token_blacklist._get_pool", return_value=pool):
        result = await revoke_token(PAYLOAD)
    assert result is True
    pool.set.assert_called_once()
    assert _mem_is_revoked(_token_jti(PAYLOAD))


@pytest.mark.asyncio
async def test_revoke_token_redis_exception_still_writes_memory():
    _clear_mem()
    pool = AsyncMock()
    pool.set = AsyncMock(side_effect=ConnectionError("Redis down"))
    with patch("api.auth.token_blacklist._get_pool", return_value=pool):
        result = await revoke_token(PAYLOAD)
    assert result is False
    assert _mem_is_revoked(_token_jti(PAYLOAD)), "memory must be written before Redis attempt"


# ---------------------------------------------------------------------------
# Integration: is_revoked memory fast-path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_is_revoked_memory_hit_skips_redis():
    _clear_mem()
    jti = _token_jti(PAYLOAD)
    _mem_revoke(jti)

    pool = AsyncMock()
    pool.exists = AsyncMock()
    with patch("api.auth.token_blacklist._get_pool", return_value=pool):
        result = await is_revoked(PAYLOAD)
    assert result is True
    pool.exists.assert_not_called()  # short-circuit on memory hit


@pytest.mark.asyncio
async def test_is_revoked_falls_back_to_redis_on_memory_miss():
    _clear_mem()
    pool = AsyncMock()
    pool.exists = AsyncMock(return_value=1)
    with patch("api.auth.token_blacklist._get_pool", return_value=pool):
        result = await is_revoked(PAYLOAD)
    assert result is True
    pool.exists.assert_called_once()


@pytest.mark.asyncio
async def test_is_revoked_returns_false_when_redis_down_and_no_memory():
    _clear_mem()
    with patch("api.auth.token_blacklist._get_pool", return_value=None):
        result = await is_revoked(PAYLOAD)
    assert result is False


@pytest.mark.asyncio
async def test_is_revoked_redis_exception_returns_false():
    _clear_mem()
    pool = AsyncMock()
    pool.exists = AsyncMock(side_effect=ConnectionError("Redis down"))
    with patch("api.auth.token_blacklist._get_pool", return_value=pool):
        result = await is_revoked(PAYLOAD)
    assert result is False


# ---------------------------------------------------------------------------
# Security: two different users have different JTIs
# ---------------------------------------------------------------------------

def test_different_users_have_different_jtis():
    p1 = {"sub": "user-1", "exp": 9999}
    p2 = {"sub": "user-2", "exp": 9999}
    assert _token_jti(p1) != _token_jti(p2)
