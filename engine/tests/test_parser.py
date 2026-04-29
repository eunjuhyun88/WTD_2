"""Unit tests for POST /patterns/parse (A-03-eng)."""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest


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


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_parse_pattern_text_success():
    """Mock configured LLM response → PatternDraftBody validation succeeds."""
    from api.routes.patterns import _call_pattern_parser_llm, _validate_draft

    mock_generate = AsyncMock(return_value=json.dumps(VALID_DRAFT))

    with patch("api.routes.patterns.generate_llm_text", mock_generate):
        draft = asyncio.run(_call_pattern_parser_llm("system", "user"))
        assert draft.pattern_family == "oi-spike-price-decline"
        assert len(draft.phases) == 1
        assert draft.phases[0].phase_id == "PHASE_0"

        # Test _validate_draft directly
        draft = _validate_draft(VALID_DRAFT)
        assert draft.pattern_family == "oi-spike-price-decline"
        assert len(draft.phases) == 1
        assert draft.phases[0].phase_id == "PHASE_0"

    mock_generate.assert_awaited_once()


def test_parse_pattern_text_strips_fenced_json():
    """Local models often wrap JSON in markdown fences."""
    from api.routes.patterns import _call_pattern_parser_llm

    mock_generate = AsyncMock(return_value=f"```json\n{json.dumps(VALID_DRAFT)}\n```")
    with patch("api.routes.patterns.generate_llm_text", mock_generate):
        draft = asyncio.run(_call_pattern_parser_llm("system", "user"))

    assert draft.pattern_family == "oi-spike-price-decline"


def test_parse_pattern_text_maps_runtime_error_to_http_exception():
    """Provider errors surface as HTTP status codes."""
    from fastapi import HTTPException

    from agents.llm_runtime import LLMRuntimeError
    from api.routes.patterns import _call_pattern_parser_llm

    mock_generate = AsyncMock(side_effect=LLMRuntimeError("Ollama missing", status_code=503))
    with patch("api.routes.patterns.generate_llm_text", mock_generate):
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(_call_pattern_parser_llm("system", "user"))

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == "Ollama missing"


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
