"""Tests for wizard.schema — YAML loader + block introspection.

These tests exercise the real pattern_hunting.yaml schema and resolve
real building_blocks functions, so they double as an integration check
that the schema's module/function references are valid.
"""
from __future__ import annotations

import pytest

from wizard.schema import introspect_params, load_schema, resolve_block


def test_load_schema_returns_dict_with_expected_sections():
    schema = load_schema("pattern_hunting")
    assert schema["version"] == 1
    assert schema["schema"] == "pattern_hunting"
    for section in ("identity", "setup", "blocks", "outcome"):
        assert section in schema, f"missing section: {section}"


def test_all_block_options_resolve():
    """Every {module, function} pair in the schema must import successfully."""
    schema = load_schema("pattern_hunting")
    for slot_name, slot_def in schema["blocks"].items():
        for opt in slot_def["options"]:
            fn = resolve_block(opt["module"], opt["function"])
            assert callable(fn), f"{slot_name}/{opt['function']} is not callable"


def test_introspect_recent_rally_params():
    from building_blocks.triggers import recent_rally

    params = introspect_params(recent_rally)
    names = [p["name"] for p in params]
    assert "pct" in names
    assert "lookback_bars" in names
    assert "ctx" not in names  # ctx is explicitly skipped

    by_name = {p["name"]: p for p in params}
    assert by_name["pct"]["default"] == 0.30
    assert by_name["lookback_bars"]["default"] == 120
    assert by_name["pct"]["annotation"] is float
    assert by_name["lookback_bars"]["annotation"] is int


def test_introspect_engulfing_has_no_params():
    # bullish_engulfing takes only ctx; introspection returns empty list
    from building_blocks.entries import bullish_engulfing

    params = introspect_params(bullish_engulfing)
    assert params == []


def test_resolve_bad_function_raises():
    with pytest.raises(AttributeError):
        resolve_block("building_blocks.triggers", "nonexistent_block")
