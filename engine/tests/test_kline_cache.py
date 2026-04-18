"""Tests for cache.kline_cache — no real Redis required.

All tests use a fake Redis pool (dict-backed) injected via monkeypatch
so the suite runs in CI without a live Redis instance.
Uses asyncio.run() per the existing test convention in this repo.
"""
from __future__ import annotations

import asyncio
import json

import pytest

import cache.kline_cache as kc


# ── Fake Redis ──────────────────────────────────────────────────────────────

class _FakeRedis:
    """Minimal async fake for redis.asyncio.Redis."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[str, int | None]] = {}

    async def ping(self) -> bool:
        return True

    async def get(self, key: str) -> str | None:
        entry = self._store.get(key)
        return entry[0] if entry else None

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._store[key] = (value, ex)

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def aclose(self) -> None:
        pass


@pytest.fixture()
def fake_pool(monkeypatch):
    pool = _FakeRedis()
    monkeypatch.setattr(kc, "_pool", pool)
    return pool


@pytest.fixture()
def no_pool(monkeypatch):
    monkeypatch.setattr(kc, "_pool", None)


# ── Sample rows ─────────────────────────────────────────────────────────────

_ROWS = [
    {"t": 1_700_000_000_000, "o": 30000.0, "h": 30500.0, "l": 29900.0, "c": 30200.0, "v": 100.0},
    {"t": 1_700_003_600_000, "o": 30200.0, "h": 30800.0, "l": 30100.0, "c": 30700.0, "v": 120.0},
]


# ── get_klines ───────────────────────────────────────────────────────────────

def test_get_klines_returns_none_on_miss(fake_pool):
    result = asyncio.run(kc.get_klines("BTCUSDT", "4h"))
    assert result is None


def test_get_klines_hit_after_set(fake_pool):
    asyncio.run(kc.set_klines("BTCUSDT", "4h", _ROWS))
    result = asyncio.run(kc.get_klines("BTCUSDT", "4h"))
    assert result == _ROWS


def test_get_klines_no_pool_returns_none(no_pool):
    result = asyncio.run(kc.get_klines("BTCUSDT", "4h"))
    assert result is None


# ── set_klines ───────────────────────────────────────────────────────────────

def test_set_klines_stores_json(fake_pool):
    asyncio.run(kc.set_klines("ETHUSDT", "1h", _ROWS))
    raw = asyncio.run(fake_pool.get("kline:ETHUSDT:1h"))
    assert raw is not None
    assert json.loads(raw) == _ROWS


def test_set_klines_uses_correct_ttl(fake_pool):
    asyncio.run(kc.set_klines("BTCUSDT", "1d", _ROWS))
    key = "kline:BTCUSDT:1d"
    entry = fake_pool._store.get(key)
    assert entry is not None
    _value, ttl = entry
    assert ttl == kc.KLINE_TTL["1d"]


def test_set_klines_no_pool_noop(no_pool):
    asyncio.run(kc.set_klines("BTCUSDT", "4h", _ROWS))  # must not raise


# ── invalidate ───────────────────────────────────────────────────────────────

def test_invalidate_removes_entry(fake_pool):
    asyncio.run(kc.set_klines("SOLUSDT", "1h", _ROWS))
    asyncio.run(kc.invalidate("SOLUSDT", "1h"))
    result = asyncio.run(kc.get_klines("SOLUSDT", "1h"))
    assert result is None


def test_invalidate_no_pool_noop(no_pool):
    asyncio.run(kc.invalidate("BTCUSDT", "4h"))  # must not raise


# ── is_connected ─────────────────────────────────────────────────────────────

def test_is_connected_true(fake_pool):
    assert kc.is_connected() is True


def test_is_connected_false(no_pool):
    assert kc.is_connected() is False


# ── TTL policy completeness ───────────────────────────────────────────────────

def test_kline_ttl_all_tfs_covered():
    from data_cache.resample import SUPPORTED_TF_STRINGS
    for tf in SUPPORTED_TF_STRINGS:
        assert isinstance(kc.KLINE_TTL.get(tf, kc._DEFAULT_TTL), int)


# ── key format ───────────────────────────────────────────────────────────────

def test_key_format():
    assert kc._key("btcusdt", "4h") == "kline:BTCUSDT:4h"
    assert kc._key("ETHUSDT", "1d") == "kline:ETHUSDT:1d"
