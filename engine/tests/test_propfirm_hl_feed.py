"""Tests for W-PF-102: PropFirm HL feed worker (engine/workers/propfirm_hl_feed.py)

Coverage:
- run_feed_once() REST path: successful fetch writes to Redis
- run_feed_once(): HTTP error returns empty dict without writing
- run_feed_once(): network exception returns empty dict
- run_feed_once(): only writes SYMBOLS that appear in response
- write_mid(): correct key format and TTL
- write_mid(): graceful degradation when Redis pool is None
- get_mid(): returns float from Redis
- get_mid(): returns None when key missing
- get_mid(): returns None when Redis pool is None
"""
from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

def _make_aiohttp_response(status: int, body: dict) -> MagicMock:
    resp = AsyncMock()
    resp.status = status
    resp.json = AsyncMock(return_value=body)
    resp.__aenter__ = AsyncMock(return_value=resp)
    resp.__aexit__ = AsyncMock(return_value=False)
    return resp


def _make_aiohttp_session(resp: MagicMock) -> MagicMock:
    post_ctx = MagicMock()
    post_ctx.__aenter__ = AsyncMock(return_value=resp)
    post_ctx.__aexit__ = AsyncMock(return_value=False)

    session = AsyncMock()
    session.post = MagicMock(return_value=post_ctx)
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    return session


@pytest.fixture()
def mock_redis():
    pool = AsyncMock()
    pool.setex = AsyncMock()
    pool.get = AsyncMock(return_value=None)
    with patch("cache.kline_cache._pool", pool):
        yield pool


# ---------------------------------------------------------------------------
# write_mid
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_write_mid_correct_key_and_ttl(mock_redis):
    from workers.propfirm_hl_feed import write_mid

    await write_mid("BTC", 65432.10)

    mock_redis.setex.assert_called_once_with("propfirm:mid:BTC", 30, "65432.1")


@pytest.mark.asyncio
async def test_write_mid_uppercases_symbol(mock_redis):
    from workers.propfirm_hl_feed import write_mid

    await write_mid("eth", 3200.5)

    mock_redis.setex.assert_called_once_with("propfirm:mid:ETH", 30, "3200.5")


@pytest.mark.asyncio
async def test_write_mid_no_pool_does_not_raise():
    from workers.propfirm_hl_feed import write_mid

    with patch("cache.kline_cache._pool", None):
        await write_mid("BTC", 65000.0)  # should not raise


@pytest.mark.asyncio
async def test_write_mid_redis_error_does_not_raise(mock_redis):
    from workers.propfirm_hl_feed import write_mid

    mock_redis.setex.side_effect = Exception("connection refused")
    await write_mid("BTC", 65000.0)  # should not raise


# ---------------------------------------------------------------------------
# get_mid
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_mid_returns_float(mock_redis):
    from workers.propfirm_hl_feed import get_mid

    mock_redis.get = AsyncMock(return_value=b"65432.10")
    result = await get_mid("BTC")

    assert result == pytest.approx(65432.10)
    mock_redis.get.assert_called_once_with("propfirm:mid:BTC")


@pytest.mark.asyncio
async def test_get_mid_missing_key_returns_none(mock_redis):
    from workers.propfirm_hl_feed import get_mid

    mock_redis.get = AsyncMock(return_value=None)
    result = await get_mid("BTC")

    assert result is None


@pytest.mark.asyncio
async def test_get_mid_no_pool_returns_none():
    from workers.propfirm_hl_feed import get_mid

    with patch("cache.kline_cache._pool", None):
        result = await get_mid("BTC")
    assert result is None


@pytest.mark.asyncio
async def test_get_mid_redis_error_returns_none(mock_redis):
    from workers.propfirm_hl_feed import get_mid

    mock_redis.get.side_effect = Exception("timeout")
    result = await get_mid("ETH")

    assert result is None


# ---------------------------------------------------------------------------
# run_feed_once — success path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_feed_once_writes_all_three_symbols(mock_redis):
    from workers.propfirm_hl_feed import run_feed_once

    hl_response = {"BTC": "65432.10", "ETH": "3200.50", "SOL": "142.30", "DOGE": "0.12"}
    resp = _make_aiohttp_response(200, hl_response)
    session = _make_aiohttp_session(resp)

    with patch("aiohttp.ClientSession", return_value=session):
        result = await run_feed_once()

    assert result == {"BTC": pytest.approx(65432.10), "ETH": pytest.approx(3200.50), "SOL": pytest.approx(142.30)}
    assert mock_redis.setex.call_count == 3


@pytest.mark.asyncio
async def test_run_feed_once_redis_keys(mock_redis):
    from workers.propfirm_hl_feed import run_feed_once

    hl_response = {"BTC": "65000.0", "ETH": "3100.0", "SOL": "140.0"}
    resp = _make_aiohttp_response(200, hl_response)
    session = _make_aiohttp_session(resp)

    with patch("aiohttp.ClientSession", return_value=session):
        await run_feed_once()

    called_keys = {call.args[0] for call in mock_redis.setex.call_args_list}
    assert called_keys == {"propfirm:mid:BTC", "propfirm:mid:ETH", "propfirm:mid:SOL"}


@pytest.mark.asyncio
async def test_run_feed_once_redis_ttl(mock_redis):
    from workers.propfirm_hl_feed import run_feed_once, _REDIS_TTL

    hl_response = {"BTC": "65000.0", "ETH": "3100.0", "SOL": "140.0"}
    resp = _make_aiohttp_response(200, hl_response)
    session = _make_aiohttp_session(resp)

    with patch("aiohttp.ClientSession", return_value=session):
        await run_feed_once()

    for call in mock_redis.setex.call_args_list:
        assert call.args[1] == _REDIS_TTL


@pytest.mark.asyncio
async def test_run_feed_once_partial_symbols(mock_redis):
    """Only BTC present in response — only BTC written to Redis."""
    from workers.propfirm_hl_feed import run_feed_once

    hl_response = {"BTC": "65000.0", "LINK": "18.5"}
    resp = _make_aiohttp_response(200, hl_response)
    session = _make_aiohttp_session(resp)

    with patch("aiohttp.ClientSession", return_value=session):
        result = await run_feed_once()

    assert set(result.keys()) == {"BTC"}
    assert mock_redis.setex.call_count == 1


# ---------------------------------------------------------------------------
# run_feed_once — failure paths
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_feed_once_http_error_returns_empty(mock_redis):
    from workers.propfirm_hl_feed import run_feed_once

    resp = _make_aiohttp_response(503, {})
    session = _make_aiohttp_session(resp)

    with patch("aiohttp.ClientSession", return_value=session):
        result = await run_feed_once()

    assert result == {}
    mock_redis.setex.assert_not_called()


@pytest.mark.asyncio
async def test_run_feed_once_network_exception_returns_empty(mock_redis):
    from workers.propfirm_hl_feed import run_feed_once
    import aiohttp

    with patch("aiohttp.ClientSession", side_effect=aiohttp.ClientConnectorError(MagicMock(), OSError("refused"))):
        result = await run_feed_once()

    assert result == {}
    mock_redis.setex.assert_not_called()


@pytest.mark.asyncio
async def test_run_feed_once_timeout_returns_empty(mock_redis):
    import asyncio as _asyncio
    from workers.propfirm_hl_feed import run_feed_once

    with patch("aiohttp.ClientSession", side_effect=_asyncio.TimeoutError()):
        result = await run_feed_once()

    assert result == {}


@pytest.mark.asyncio
async def test_run_feed_once_redis_unavailable_still_returns_results():
    """Even if Redis write fails, the returned dict should still be correct."""
    from workers.propfirm_hl_feed import run_feed_once

    hl_response = {"BTC": "65000.0", "ETH": "3100.0", "SOL": "140.0"}
    resp = _make_aiohttp_response(200, hl_response)
    session = _make_aiohttp_session(resp)

    with patch("cache.kline_cache._pool", None), \
         patch("aiohttp.ClientSession", return_value=session):
        result = await run_feed_once()

    assert set(result.keys()) == {"BTC", "ETH", "SOL"}
