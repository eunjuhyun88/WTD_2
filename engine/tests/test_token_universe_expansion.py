"""Tests for token_universe expansion: UniverseToken, _calc_cap_group, _fetch_spot_tickers, get_universe_tokens."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from data_cache.token_universe import (
    UniverseToken,
    _calc_cap_group,
    _fetch_spot_tickers,
    get_universe_tokens,
)


# ---------------------------------------------------------------------------
# _calc_cap_group
# ---------------------------------------------------------------------------


def test_cap_group_mega():
    """$50B+ -> mega."""
    assert _calc_cap_group(100_000_000_000) == "mega"
    assert _calc_cap_group(50_000_000_000) == "mega"


def test_cap_group_large():
    """$5B–$50B -> large."""
    assert _calc_cap_group(5_000_000_000) == "large"
    assert _calc_cap_group(10_000_000_000) == "large"


def test_cap_group_mid():
    """$500M–$5B -> mid."""
    assert _calc_cap_group(500_000_000) == "mid"
    assert _calc_cap_group(1_000_000_000) == "mid"


def test_cap_group_small():
    """$50M–$500M -> small."""
    assert _calc_cap_group(50_000_000) == "small"
    assert _calc_cap_group(200_000_000) == "small"


def test_cap_group_micro():
    """< $50M -> micro."""
    assert _calc_cap_group(1_000_000) == "micro"
    assert _calc_cap_group(49_999_999) == "micro"


def test_cap_group_unknown():
    """None market_cap -> unknown."""
    assert _calc_cap_group(None) == "unknown"


def test_cap_group_zero():
    """0.0 market_cap -> micro (not unknown)."""
    assert _calc_cap_group(0.0) == "micro"


# ---------------------------------------------------------------------------
# UniverseToken dataclass
# ---------------------------------------------------------------------------


def test_universe_token_fields():
    token = UniverseToken(
        symbol="ETHUSDT",
        base="ETH",
        quote="USDT",
        exchange="binance_spot",
        has_perp=False,
        volume_usd_24h=1_000_000_000.0,
    )
    assert token.symbol == "ETHUSDT"
    assert token.base == "ETH"
    assert token.quote == "USDT"
    assert token.exchange == "binance_spot"
    assert token.has_perp is False
    assert token.volume_usd_24h == 1_000_000_000.0
    assert token.market_cap_usd is None
    assert token.cap_group == "unknown"


# ---------------------------------------------------------------------------
# _fetch_spot_tickers
# ---------------------------------------------------------------------------

_MOCK_SPOT_DATA = [
    {"symbol": "ETHUSDT", "quoteVolume": "1000000000"},
    {"symbol": "SOLUSDT", "quoteVolume": "800000000"},
    {"symbol": "BTCUSDT", "quoteVolume": "5000000000"},   # futures duplicate
    {"symbol": "PEPEUSDT", "quoteVolume": "10000"},       # below volume threshold
    {"symbol": "XYZBTC", "quoteVolume": "999999999"},     # non-USDT quote
    {"symbol": "LINKUSDT", "quoteVolume": "600000"},      # above threshold
]


def _make_mock_response(data: list) -> MagicMock:
    mock_resp = MagicMock()
    mock_resp.json.return_value = data
    mock_resp.raise_for_status.return_value = None
    return mock_resp


def test_spot_tickers_volume_filter():
    """Tokens below min_volume_usd_24h are excluded."""
    with patch("data_cache.token_universe.requests") as mock_requests:
        mock_requests.get.return_value = _make_mock_response(_MOCK_SPOT_DATA)
        tokens = _fetch_spot_tickers(min_volume_usd_24h=500_000)

    symbols = [t.symbol for t in tokens]
    assert "PEPEUSDT" not in symbols


def test_spot_tickers_excludes_non_usdt():
    """Non-USDT pairs (XYZBTC) are excluded."""
    with patch("data_cache.token_universe.requests") as mock_requests:
        mock_requests.get.return_value = _make_mock_response(_MOCK_SPOT_DATA)
        tokens = _fetch_spot_tickers(min_volume_usd_24h=500_000)

    symbols = [t.symbol for t in tokens]
    assert "XYZBTC" not in symbols


def test_spot_tickers_excludes_futures():
    """Symbols in exclude_futures_symbols set are dropped."""
    with patch("data_cache.token_universe.requests") as mock_requests:
        mock_requests.get.return_value = _make_mock_response(_MOCK_SPOT_DATA)
        tokens = _fetch_spot_tickers(
            min_volume_usd_24h=500_000,
            exclude_futures_symbols={"BTCUSDT"},
        )

    symbols = [t.symbol for t in tokens]
    assert "BTCUSDT" not in symbols
    assert "ETHUSDT" in symbols


def test_has_perp_false_for_spot():
    """All spot tokens have has_perp=False."""
    with patch("data_cache.token_universe.requests") as mock_requests:
        mock_requests.get.return_value = _make_mock_response(_MOCK_SPOT_DATA)
        tokens = _fetch_spot_tickers(min_volume_usd_24h=500_000)

    assert all(t.has_perp is False for t in tokens)


def test_spot_exchange_label():
    """All spot tokens carry exchange='binance_spot'."""
    with patch("data_cache.token_universe.requests") as mock_requests:
        mock_requests.get.return_value = _make_mock_response(_MOCK_SPOT_DATA)
        tokens = _fetch_spot_tickers(min_volume_usd_24h=500_000)

    assert all(t.exchange == "binance_spot" for t in tokens)


def test_spot_tickers_network_failure_returns_empty():
    """When the HTTP call raises, an empty list is returned (no exception propagated)."""
    with patch("data_cache.token_universe.requests") as mock_requests:
        mock_requests.get.side_effect = ConnectionError("timeout")
        tokens = _fetch_spot_tickers()

    assert tokens == []


def test_spot_tickers_http_error_returns_empty():
    """Non-2xx response returns empty list."""
    import requests as req_lib

    with patch("data_cache.token_universe.requests") as mock_requests:
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = req_lib.HTTPError("404")
        mock_requests.get.return_value = mock_resp
        tokens = _fetch_spot_tickers()

    assert tokens == []


# ---------------------------------------------------------------------------
# get_universe_tokens
# ---------------------------------------------------------------------------


def test_get_universe_tokens_include_spot_false_no_api_call():
    """include_spot=False must not call the spot API at all."""
    with patch("data_cache.token_universe._fetch_spot_tickers") as mock_fetch:
        result = get_universe_tokens(include_spot=False)
    mock_fetch.assert_not_called()
    # Futures cache is empty in unit-test context, so result is an empty list
    assert isinstance(result, list)


def test_get_universe_tokens_include_spot_calls_fetch():
    """include_spot=True delegates to _fetch_spot_tickers."""
    mock_tokens = [
        UniverseToken(
            symbol="ETHUSDT",
            base="ETH",
            quote="USDT",
            exchange="binance_spot",
            has_perp=False,
            volume_usd_24h=1_000_000_000.0,
        )
    ]
    with patch("data_cache.token_universe._fetch_spot_tickers", return_value=mock_tokens) as mock_fetch:
        result = get_universe_tokens(include_spot=True)

    mock_fetch.assert_called_once()
    assert any(t.symbol == "ETHUSDT" for t in result)


def test_get_universe_tokens_futures_passed_as_exclude():
    """Futures symbols are forwarded to _fetch_spot_tickers as exclude set."""
    import data_cache.token_universe as tu

    fake_cached = [
        {
            "symbol": "BTCUSDT",
            "base": "BTC",
            "vol_24h_usd": 5_000_000_000.0,
            "market_cap": 1_000_000_000_000.0,
        }
    ]
    with patch.object(tu, "get_cached_universe", return_value=fake_cached):
        with patch.object(tu, "_fetch_spot_tickers", return_value=[]) as mock_fetch:
            get_universe_tokens(include_spot=True, include_futures=True)

    called_kwargs = mock_fetch.call_args
    exclude_set = called_kwargs.kwargs.get("exclude_futures_symbols") or called_kwargs.args[1]
    assert "BTCUSDT" in exclude_set


def test_get_universe_tokens_futures_only():
    """include_futures=True, include_spot=False returns only futures tokens."""
    import data_cache.token_universe as tu

    fake_cached = [
        {
            "symbol": "BTCUSDT",
            "base": "BTC",
            "vol_24h_usd": 5_000_000_000.0,
            "market_cap": 1_000_000_000_000.0,
        }
    ]
    with patch.object(tu, "get_cached_universe", return_value=fake_cached):
        result = get_universe_tokens(include_spot=False, include_futures=True)

    assert len(result) == 1
    assert result[0].symbol == "BTCUSDT"
    assert result[0].exchange == "binance_futures"
    assert result[0].has_perp is True


def test_get_universe_tokens_futures_cap_group_computed():
    """Futures tokens have cap_group computed from market_cap."""
    import data_cache.token_universe as tu

    fake_cached = [
        {
            "symbol": "BTCUSDT",
            "base": "BTC",
            "vol_24h_usd": 5_000_000_000.0,
            "market_cap": 1_200_000_000_000.0,  # $1.2T -> mega
        }
    ]
    with patch.object(tu, "get_cached_universe", return_value=fake_cached):
        result = get_universe_tokens(include_spot=False, include_futures=True)

    assert result[0].cap_group == "mega"


def test_get_universe_tokens_zero_market_cap_treated_as_none():
    """market_cap=0.0 in futures cache is treated as unknown cap_group."""
    import data_cache.token_universe as tu

    fake_cached = [
        {
            "symbol": "NEWUSDT",
            "base": "NEW",
            "vol_24h_usd": 10_000_000.0,
            "market_cap": 0.0,
        }
    ]
    with patch.object(tu, "get_cached_universe", return_value=fake_cached):
        result = get_universe_tokens(include_spot=False, include_futures=True)

    assert result[0].cap_group == "unknown"
