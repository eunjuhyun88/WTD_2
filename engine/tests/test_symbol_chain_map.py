"""W-0097 P2 — SYMBOL_CHAIN_MAP schema + content gate.

The map drives the OKX smart-money fetcher. A malformed address won't crash
the service (OKX returns empty list), but it silently disables whale-
accumulation detection for that symbol and wastes API quota. The test
suite acts as the validation gate.
"""
from __future__ import annotations

from data_cache.fetch_okx_smart_money import (
    SUPPORTED_CHAIN_INDICES,
    SYMBOL_CHAIN_MAP,
    validate_symbol_chain_map,
)


def test_built_in_map_is_valid():
    errors = validate_symbol_chain_map()
    assert errors == [], f"SYMBOL_CHAIN_MAP format errors: {errors}"


def test_supported_chain_indices_cover_built_in_entries():
    for symbol, (chain, _) in SYMBOL_CHAIN_MAP.items():
        assert chain in SUPPORTED_CHAIN_INDICES, f"{symbol}: unsupported chain {chain!r}"


def test_cex_native_entries_have_empty_address():
    for symbol in ("BTCUSDT", "ETHUSDT", "SOLUSDT"):
        chain, addr = SYMBOL_CHAIN_MAP[symbol]
        assert chain == ""
        assert addr == ""


def test_w0097_p2_additions_registered():
    """TRUMP + POPCAT are the verified 2026-04-19 additions."""
    assert "TRUMPUSDT" in SYMBOL_CHAIN_MAP
    assert "POPCATUSDT" in SYMBOL_CHAIN_MAP
    trump_chain, trump_addr = SYMBOL_CHAIN_MAP["TRUMPUSDT"]
    popcat_chain, popcat_addr = SYMBOL_CHAIN_MAP["POPCATUSDT"]
    # Verified Coinbase Assets post addresses (2026-04-19 web search).
    assert trump_chain == "501"
    assert trump_addr == "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN"
    assert popcat_chain == "501"
    assert popcat_addr == "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"


def test_validator_flags_unknown_chain():
    bad = {"XUSDT": ("999", "0x123")}  # chain 999 not supported
    errors = validate_symbol_chain_map(bad)
    assert len(errors) == 1
    assert "chain_index '999'" in errors[0]


def test_validator_flags_malformed_ethereum_address():
    bad = {"BADETH": ("1", "0x12")}  # too short
    errors = validate_symbol_chain_map(bad)
    assert len(errors) == 1
    assert "Ethereum address" in errors[0]


def test_validator_flags_solana_length_out_of_range():
    bad = {"BADSOL": ("501", "tooshort")}
    errors = validate_symbol_chain_map(bad)
    assert len(errors) == 1
    assert "Solana address length" in errors[0]


def test_validator_flags_cex_entry_with_nonempty_address():
    bad = {"BTCUSDT": ("", "0xabcdef")}
    errors = validate_symbol_chain_map(bad)
    assert len(errors) == 1
    assert "empty address" in errors[0]


def test_validator_flags_onchain_missing_address():
    bad = {"EMPTY": ("501", "")}
    errors = validate_symbol_chain_map(bad)
    assert len(errors) == 1
    assert "missing contract address" in errors[0]


def test_validator_flags_malformed_value_tuple():
    bad = {"XUSDT": "not-a-tuple"}  # type: ignore[dict-item]
    errors = validate_symbol_chain_map(bad)
    assert len(errors) == 1


def test_validator_returns_empty_for_empty_map():
    assert validate_symbol_chain_map({}) == []
