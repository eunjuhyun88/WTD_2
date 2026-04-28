"""Tests for W-0292 D-D — BTC ETF flow fetcher."""
import pytest
from data_cache.fetch_etf_flow import (
    fetch_btc_etf_flow_static,
    fetch_btc_etf_flow_aggregate,
    get_etf_flow_7d_usd,
    BTC_ETF_ISSUERS,
)


def test_issuers_not_empty():
    assert len(BTC_ETF_ISSUERS) >= 5


def test_issuers_contains_known_tickers():
    assert "IBIT" in BTC_ETF_ISSUERS
    assert "FBTC" in BTC_ETF_ISSUERS
    assert "GBTC" in BTC_ETF_ISSUERS


def test_static_returns_list():
    result = fetch_btc_etf_flow_static()
    assert isinstance(result, list)


def test_static_returns_empty_list():
    # Phase 1: static mode returns empty (Farside integration pending)
    result = fetch_btc_etf_flow_static()
    assert result == []


def test_aggregate_empty_returns_correct_dataframe():
    df = fetch_btc_etf_flow_aggregate()
    assert "total_flow_usd_millions" in df.columns
    assert "n_etfs_reporting" in df.columns
    assert "date" in df.columns
    assert len(df) == 0


def test_7d_none_when_no_data():
    result = get_etf_flow_7d_usd()
    # Phase 1: static mode returns no data -> None
    assert result is None
