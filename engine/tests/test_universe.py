"""Tests for universe.load_universe and the supported universe roster."""
from __future__ import annotations

import asyncio

import pytest

from universe import load_universe, load_universe_async
from universe.binance_30 import LARGE_CAP, MID_CAP, SMALL_CAP, SYMBOLS


def test_binance_30_tier_counts():
    assert len(LARGE_CAP) == 10
    assert len(MID_CAP) == 10
    assert len(SMALL_CAP) == 10
    assert len(SYMBOLS) == 30


def test_binance_30_no_duplicates():
    assert len(set(SYMBOLS)) == 30


def test_binance_30_all_usdt_pairs():
    for sym in SYMBOLS:
        assert sym.endswith("USDT"), sym
        assert sym.isupper(), sym


def test_load_universe_binance_30_returns_30_symbols():
    syms = load_universe("binance_30")
    assert len(syms) == 30
    assert "BTCUSDT" in syms
    assert "ETHUSDT" in syms


def test_load_universe_returns_mutable_list():
    # Callers should get a fresh list they can reorder without
    # accidentally mutating the module-level tuple.
    a = load_universe("binance_30")
    b = load_universe("binance_30")
    assert isinstance(a, list)
    a.append("FAKEUSDT")
    assert len(b) == 30, "mutation leaked into the second call"


def test_load_universe_unknown_raises_keyerror():
    with pytest.raises(KeyError):
        load_universe("nonexistent_universe")


def test_load_universe_async_dynamic_uses_async_loader(monkeypatch):
    async def fake_loader(**kwargs):
        assert kwargs == {}
        return ["BTCUSDT", "ETHUSDT", "SOLUSDT"]

    monkeypatch.setattr("universe.dynamic.load_dynamic_universe_async", fake_loader)
    syms = asyncio.run(load_universe_async("binance_dynamic"))
    assert syms == ["BTCUSDT", "ETHUSDT", "SOLUSDT"]


def test_load_universe_async_all_expands_limits(monkeypatch):
    seen: dict[str, object] = {}

    async def fake_loader(**kwargs):
        seen.update(kwargs)
        return ["BTCUSDT"]

    monkeypatch.setattr("universe.dynamic.load_dynamic_universe_async", fake_loader)
    syms = asyncio.run(load_universe_async("binance_all"))
    assert syms == ["BTCUSDT"]
    assert seen == {"min_volume_usd": 0, "max_symbols": 500}


def test_load_universe_binance_dynamic_dispatches(monkeypatch: pytest.MonkeyPatch):
    from universe import dynamic

    def fake_load_dynamic_universe(*, min_volume_usd: float = 500_000.0, max_symbols: int = 300, fallback: bool = True):
        assert min_volume_usd == 500_000.0
        assert max_symbols == 300
        assert fallback is True
        return ["BTCUSDT", "ETHUSDT", "SOLUSDT"]

    monkeypatch.setattr(dynamic, "load_dynamic_universe", fake_load_dynamic_universe)

    assert load_universe("binance_dynamic") == ["BTCUSDT", "ETHUSDT", "SOLUSDT"]


def test_load_universe_binance_all_dispatches(monkeypatch: pytest.MonkeyPatch):
    from universe import dynamic

    def fake_load_dynamic_universe(*, min_volume_usd: float = 500_000.0, max_symbols: int = 300, fallback: bool = True):
        assert min_volume_usd == 0
        assert max_symbols == 500
        assert fallback is True
        return ["BTCUSDT", "ETHUSDT"]

    monkeypatch.setattr(dynamic, "load_dynamic_universe", fake_load_dynamic_universe)

    assert load_universe("binance_all") == ["BTCUSDT", "ETHUSDT"]
