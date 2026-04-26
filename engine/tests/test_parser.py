"""Unit tests for POST /patterns/parse (A-03-eng).

Uses unittest.mock to patch the anthropic client — no real API call is made.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── Fixtures ─────────────────────────────────────────────────────────────────

VALID_DRAFT = {
    "schema_version": 1,
    "pattern_family": "oi-spike-price-decline",
    "pattern_label": "OI Spike with Price Decline",
    "source_type": "text",
    "source_text": "OI가 급등하면서 가격이 하락했다",
    "symbol_candidates": ["BTCUSDT"],
    "timeframe": "1h",
    "thesis": ["Open interest surges while price declines, signaling potential short squeeze or forced liquidation."],
    "phases": [
        {
            "phase_id": "PHASE_0",
            "label": "OI Spike",
            "sequence_order": 0,
            "description": "Open interest increases rapidly while price falls",
            "timeframe": None,
            "signals_required": ["oi_spike"],
            "signals_preferred": ["high_funding"],
            "signals_forbidden": [],
            "directional_belief": "bearish",
            "evidence_text": None,
            "time_hint": None,
            "importance": 0.9,
        }
    ],
    "trade_plan": {
        "entry_condition": "Enter short when OI spikes >20% and price breaks below support",
        "disqualifiers": ["Price reversal above resistance", "OI drops quickly"],
    },
    "search_hints": {
        "must_have_signals": ["oi_spike"],
        "preferred_timeframes": ["1h"],
        "exclude_patterns": [],
        "similarity_focus": [],
        "symbol_scope": [],
    },
    "confidence": 0.75,
    "ambiguities": [],
}


def _make_mock_message(text: str) -> MagicMock:
    """Build a minimal mock that mimics anthropic.types.Message."""
    content_block = MagicMock()
    content_block.text = text
    msg = MagicMock()
    msg.content = [content_block]
    return msg


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_parse_pattern_text_success(monkeypatch):
    """Mock Claude response → PatternDraftBody validation succeeds."""
    # Patch anthropic.AsyncAnthropic so no real HTTP call is made
    mock_client = MagicMock()
    mock_messages = MagicMock()
    mock_messages.create = AsyncMock(
        return_value=_make_mock_message(json.dumps(VALID_DRAFT))
    )
    mock_client.messages = mock_messages

    with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            from api.schemas_pattern_draft import PatternDraftBody
            from api.routes.patterns import _call_claude, _validate_draft

            # Test _validate_draft directly
            draft = _validate_draft(VALID_DRAFT)
            assert draft.pattern_family == "oi-spike-price-decline"
            assert len(draft.phases) == 1
            assert draft.phases[0].phase_id == "PHASE_0"


def test_validate_draft_empty_phases_raises():
    """Draft with empty phases list raises ValueError."""
    from api.routes.patterns import _validate_draft

    bad = dict(VALID_DRAFT)
    bad["phases"] = []
    with pytest.raises(ValueError, match="phase_sequence empty"):
        _validate_draft(bad)


def test_validate_draft_missing_required_field_raises():
    """Draft missing pattern_family raises ValueError."""
    from api.routes.patterns import _validate_draft

    bad = {k: v for k, v in VALID_DRAFT.items() if k != "pattern_family"}
    with pytest.raises(ValueError):
        _validate_draft(bad)


def test_parse_text_context_system_prompt_contains_schema():
    """for_parse_text() returns a system prompt that mentions required fields."""
    from agents.context import get_assembler

    ctx = get_assembler().for_parse_text(symbol="BTCUSDT")
    assert "PatternDraftBody" in ctx.system_prompt or "phase_id" in ctx.system_prompt
    assert ctx.token_estimate > 0
    # Symbol hint should be embedded
    assert "BTCUSDT" in ctx.system_prompt


def test_parse_text_context_without_symbol():
    """for_parse_text() works without a symbol hint — no symbol-hint line appended."""
    from agents.context import get_assembler

    ctx = get_assembler().for_parse_text()
    assert ctx.system_prompt
    # The symbol hint phrase "Symbol hint (if available):" must NOT appear
    assert "Symbol hint (if available):" not in ctx.system_prompt
