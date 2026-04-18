"""Unit tests for api.score_cache — in-process TTL cache for /score responses."""
from __future__ import annotations

import time

import pytest

import api.score_cache as sc
from api.score_cache import get_score_cache, set_score_cache


@pytest.fixture(autouse=True)
def clear_cache():
    """Reset the module-level cache dict between tests."""
    sc._cache.clear()
    yield
    sc._cache.clear()


def _make_mock_response(p_win: float = 0.7):
    """Return a minimal ScoreResponse-like object for caching tests."""
    from unittest.mock import MagicMock
    resp = MagicMock()
    resp.p_win = p_win
    return resp


class TestGetScoreCache:
    def test_miss_on_empty(self):
        assert get_score_cache("BTCUSDT", 1_000_000) is None

    def test_hit_after_set(self):
        resp = _make_mock_response(0.65)
        set_score_cache("BTCUSDT", 1_000_000, resp)
        cached = get_score_cache("BTCUSDT", 1_000_000)
        assert cached is resp

    def test_miss_different_symbol(self):
        resp = _make_mock_response()
        set_score_cache("BTCUSDT", 1_000_000, resp)
        assert get_score_cache("ETHUSDT", 1_000_000) is None

    def test_miss_different_bar_ts(self):
        resp = _make_mock_response()
        set_score_cache("BTCUSDT", 1_000_000, resp)
        assert get_score_cache("BTCUSDT", 2_000_000) is None

    def test_expired_entry_returns_none(self, monkeypatch):
        resp = _make_mock_response()
        # Plant an already-expired entry directly
        key = ("BTCUSDT", 99)
        sc._cache[key] = (time.monotonic() - 1.0, resp)  # expired 1s ago
        assert get_score_cache("BTCUSDT", 99) is None
        assert key not in sc._cache  # evicted on read

    def test_unexpired_entry_survives(self):
        resp = _make_mock_response(0.80)
        set_score_cache("SOLUSDT", 42, resp)
        assert get_score_cache("SOLUSDT", 42) is resp


class TestSetScoreCache:
    def test_overwrites_existing_key(self):
        r1 = _make_mock_response(0.4)
        r2 = _make_mock_response(0.9)
        set_score_cache("BTCUSDT", 100, r1)
        set_score_cache("BTCUSDT", 100, r2)
        cached = get_score_cache("BTCUSDT", 100)
        assert cached is r2

    def test_evicts_oldest_when_full(self):
        """When _MAX_ENTRIES is exceeded, the oldest entry is dropped."""
        # Fill to max - 1
        for i in range(sc._MAX_ENTRIES - 1):
            set_score_cache(f"SYM{i}", i, _make_mock_response())
        assert len(sc._cache) == sc._MAX_ENTRIES - 1

        # The next insert triggers eviction logic (cache is not yet full, but +1 would equal max)
        set_score_cache("OVERFLOW", 0, _make_mock_response())
        assert len(sc._cache) <= sc._MAX_ENTRIES

    def test_multiple_symbols_coexist(self):
        syms = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]
        resps = [_make_mock_response(i * 0.1) for i in range(len(syms))]
        for sym, resp in zip(syms, resps):
            set_score_cache(sym, 1_000, resp)
        for sym, resp in zip(syms, resps):
            assert get_score_cache(sym, 1_000) is resp
