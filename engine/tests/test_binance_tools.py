"""Unit tests for binance_tools — no actual API calls."""
import asyncio
import json
import pytest


def test_redact_removes_64char_pattern():
    from agents.tools.binance_tools import _redact

    key = "A" * 64
    result = _redact(f"key={key}")
    assert key not in result
    assert "REDACTED" in result


def test_redact_leaves_short_strings():
    from agents.tools.binance_tools import _redact

    short = "A" * 63
    assert short in _redact(short)


def test_get_binance_balance_no_user_id():
    """Unauthenticated call returns error dict."""
    from agents.tools.binance_tools import get_binance_balance

    result = asyncio.get_event_loop().run_until_complete(get_binance_balance(None))
    assert "error" in result


def test_get_binance_positions_no_user_id():
    from agents.tools.binance_tools import get_binance_positions

    result = asyncio.get_event_loop().run_until_complete(get_binance_positions(None))
    assert "error" in result


def test_tool_schemas_include_binance():
    from agents.tools.registry import TOOL_SCHEMAS

    names = [t["name"] for t in TOOL_SCHEMAS]
    assert "get_binance_balance" in names
    assert "get_binance_positions" in names
