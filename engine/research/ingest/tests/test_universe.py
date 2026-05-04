"""Tests for universe definitions."""
from engine.research.ingest.universe import (
    ALL_SYMBOLS,
    OI_PERIODS,
    TIER1,
    TIER2,
    TIER3,
    TIMEFRAMES,
)


def test_total_symbols_count() -> None:
    assert len(ALL_SYMBOLS) == 20


def test_no_duplicate_symbols() -> None:
    assert len(set(ALL_SYMBOLS)) == len(ALL_SYMBOLS)


def test_tier1_contains_btc_eth() -> None:
    assert "BTCUSDT" in TIER1
    assert "ETHUSDT" in TIER1


def test_tier1_size() -> None:
    assert len(TIER1) == 5


def test_tier2_size() -> None:
    assert len(TIER2) == 10


def test_tier3_size() -> None:
    assert len(TIER3) == 5


def test_all_symbols_is_union() -> None:
    assert set(ALL_SYMBOLS) == set(TIER1) | set(TIER2) | set(TIER3)


def test_timeframes_includes_key_tfs() -> None:
    for tf in ["1m", "5m", "15m", "1h", "4h", "1d"]:
        assert tf in TIMEFRAMES


def test_oi_periods_includes_5m_and_1h() -> None:
    assert "5m" in OI_PERIODS
    assert "1h" in OI_PERIODS


def test_all_symbols_end_with_usdt() -> None:
    for sym in ALL_SYMBOLS:
        assert sym.endswith("USDT"), f"{sym} does not end with USDT"
