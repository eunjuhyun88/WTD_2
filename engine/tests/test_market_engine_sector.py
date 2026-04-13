"""Tests for engine/sector_map.py

Covers:
  1. base_symbol() — quote suffix stripping (all supported suffixes)
  2. base_symbol() — FDUSD vs USDT ordering (no partial match)
  3. base_symbol() — passthrough for unknown suffix
  4. base_symbol() — case insensitivity
  5. get_sector()  — known symbols map to expected sector
  6. get_sector()  — unknown symbols fall back to 'OTHER'
"""
from __future__ import annotations

import pytest

# sector_map.py lives at engine root, one level above tests/
import sys
import pathlib

_ENGINE_ROOT = pathlib.Path(__file__).parent.parent
if str(_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_ENGINE_ROOT))

from sector_map import base_symbol, get_sector


# ─────────────────────────────────────────────────────────────────────────
# 1. Standard quote suffix stripping
# ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("symbol,expected", [
    ("BTCUSDT",   "BTC"),
    ("ETHUSDT",   "ETH"),
    ("SOLUSDC",   "SOL"),
    ("XRPBUSD",   "XRP"),
    ("ADATUSD",   "ADA"),
    ("LINKDAI",   "LINK"),
    ("BNBBTC",    "BNB"),   # BNB base, BTC quote
    ("SOLETH",    "SOL"),
    ("DOGEBNB",   "DOGE"),
])
def test_base_symbol_standard_suffixes(symbol, expected):
    assert base_symbol(symbol) == expected


# ─────────────────────────────────────────────────────────────────────────
# 2. FDUSD must be stripped before USDT (longest-first ordering)
# ─────────────────────────────────────────────────────────────────────────

def test_base_symbol_fdusd_not_partial_match():
    """BTCFDUSD → BTC (not BTCFD after stripping USDT suffix)."""
    assert base_symbol("BTCFDUSD") == "BTC"


def test_base_symbol_ethfdusd():
    assert base_symbol("ETHFDUSD") == "ETH"


def test_base_symbol_solfdusd():
    assert base_symbol("SOLFDUSD") == "SOL"


# ─────────────────────────────────────────────────────────────────────────
# 3. Passthrough for unknown / no suffix
# ─────────────────────────────────────────────────────────────────────────

def test_base_symbol_no_known_suffix():
    """Symbol without a recognized suffix passes through unchanged."""
    assert base_symbol("RANDOMTOKEN") == "RANDOMTOKEN"


def test_base_symbol_exact_suffix_only_does_not_strip():
    """Symbol that IS the suffix itself → unchanged (guard: len(s) > len(suffix))."""
    assert base_symbol("USDT") == "USDT"
    assert base_symbol("BTC")  == "BTC"
    assert base_symbol("ETH")  == "ETH"


def test_base_symbol_empty_string():
    assert base_symbol("") == ""


# ─────────────────────────────────────────────────────────────────────────
# 4. Case insensitivity
# ─────────────────────────────────────────────────────────────────────────

def test_base_symbol_lowercase_input():
    assert base_symbol("btcusdt") == "BTC"


def test_base_symbol_mixed_case():
    assert base_symbol("SolUsdt") == "SOL"


# ─────────────────────────────────────────────────────────────────────────
# 5. get_sector — known sector lookups
# ─────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("symbol,expected_sector", [
    ("BTCUSDT",  "BTC"),
    ("ETHUSDT",  "ETH"),
    ("SOLUSDT",  "LAYER1"),    # SOL is classified as LAYER1
    ("BNBUSDT",  "EXCHANGE"),  # BNB is classified as EXCHANGE
])
def test_get_sector_top_assets(symbol, expected_sector):
    assert get_sector(symbol) == expected_sector


def test_get_sector_with_fdusd_suffix():
    """BTCFDUSD should resolve the same as BTCUSDT."""
    assert get_sector("BTCFDUSD") == get_sector("BTCUSDT")


def test_get_sector_with_usdc_suffix():
    assert get_sector("ETHUSDC") == get_sector("ETHUSDT")


# ─────────────────────────────────────────────────────────────────────────
# 6. Unknown symbol falls back to OTHER
# ─────────────────────────────────────────────────────────────────────────

def test_get_sector_unknown_symbol():
    assert get_sector("WEIRDCOINUSDT") == "OTHER"


def test_get_sector_empty_string():
    result = get_sector("")
    assert isinstance(result, str)
