"""Tests for W-0292 D-E — ETH network growth rate (Etherscan)."""
import pytest
from unittest.mock import patch
from data_cache.fetch_bscscan import fetch_eth_new_address_count, get_eth_network_growth_7d


def test_no_api_key_returns_empty():
    """Without an API key the fetcher must return empty, not raise."""
    with patch.dict("os.environ", {}, clear=True):
        result = fetch_eth_new_address_count(api_key=None)
    assert result == []


def test_explicit_empty_api_key_returns_empty():
    with patch.dict("os.environ", {"ETHERSCAN_API_KEY": ""}, clear=True):
        result = fetch_eth_new_address_count(api_key=None)
    assert result == []


def test_7d_growth_none_when_no_records():
    with patch(
        "data_cache.fetch_bscscan.fetch_eth_new_address_count",
        return_value=[],
    ):
        result = get_eth_network_growth_7d()
    assert result is None


def test_7d_growth_average_of_counts():
    mock_data = [
        {"date": "2026-04-23", "new_address_count": 100_000},
        {"date": "2026-04-24", "new_address_count": 120_000},
    ]
    with patch(
        "data_cache.fetch_bscscan.fetch_eth_new_address_count",
        return_value=mock_data,
    ):
        result = get_eth_network_growth_7d()
    assert result == pytest.approx(110_000)


def test_7d_growth_ignores_zero_counts():
    """Entries with new_address_count=0 are excluded from the average."""
    mock_data = [
        {"date": "2026-04-22", "new_address_count": 0},
        {"date": "2026-04-23", "new_address_count": 100_000},
        {"date": "2026-04-24", "new_address_count": 120_000},
    ]
    with patch(
        "data_cache.fetch_bscscan.fetch_eth_new_address_count",
        return_value=mock_data,
    ):
        result = get_eth_network_growth_7d()
    # Only the two non-zero entries count
    assert result == pytest.approx(110_000)


def test_result_structure_when_api_succeeds():
    """Verify the returned list has the expected keys."""
    mock_response = {
        "status": "1",
        "result": [
            {"UTCDate": "2026-04-23", "newAddressCount": "95000"},
            {"UTCDate": "2026-04-24", "newAddressCount": "102000"},
        ],
    }
    with patch("data_cache.fetch_bscscan._get_json", return_value=mock_response):
        result = fetch_eth_new_address_count(days_back=2, api_key="test_key")

    assert len(result) == 2
    assert result[0]["date"] == "2026-04-23"
    assert result[0]["new_address_count"] == 95000
    assert result[1]["new_address_count"] == 102000


def test_api_error_status_returns_empty():
    """Non-'1' status from Etherscan returns empty list."""
    mock_response = {"status": "0", "message": "NOTOK", "result": "Invalid API Key"}
    with patch("data_cache.fetch_bscscan._get_json", return_value=mock_response):
        result = fetch_eth_new_address_count(days_back=2, api_key="bad_key")
    assert result == []
