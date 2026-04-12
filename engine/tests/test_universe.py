"""Tests for universe.load_universe and the binance_30 roster."""
from __future__ import annotations

import pytest

from universe import load_universe
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
