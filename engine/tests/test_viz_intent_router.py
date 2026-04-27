"""Tests for F-17: Viz Intent Router.

Covers:
- Intent classification (explicit + keyword-based)
- All 6 intents map to correct templates
- Search vs no-search intents
- Route returns correct response shape
"""
from __future__ import annotations

from viz.templates import INTENT_TO_TEMPLATE, SEARCH_INTENTS, VizIntent
from viz.intent_router import _classify_intent


class TestIntentClassifier:
    def test_explicit_intent_wins(self):
        intent, conf = _classify_intent("비슷한 거 찾아줘", "WHY")
        assert intent == "WHY"
        assert conf == 1.0

    def test_why_keyword_korean(self):
        intent, conf = _classify_intent("이게 왜 valid야?", None)
        assert intent == "WHY"
        assert conf > 0.8

    def test_state_keyword(self):
        intent, conf = _classify_intent("지금 상태가 뭐야", None)
        assert intent == "STATE"

    def test_execution_keyword(self):
        intent, conf = _classify_intent("언제 진입해?", None)
        assert intent == "EXECUTION"

    def test_flow_keyword(self):
        intent, conf = _classify_intent("OI 흐름 비슷한 거 찾아줘", None)
        # FLOW matches before SEARCH in keyword order
        assert intent in ("FLOW", "SEARCH")

    def test_compare_keyword(self):
        intent, conf = _classify_intent("BTC랑 비교해줘", None)
        assert intent == "COMPARE"

    def test_default_fallback_to_search(self):
        intent, conf = _classify_intent(None, None)
        assert intent == "SEARCH"
        assert conf == 0.5

    def test_empty_text_fallback(self):
        intent, conf = _classify_intent("", None)
        assert intent == "SEARCH"


class TestTemplateMapping:
    def test_all_intents_have_templates(self):
        for intent in ("WHY", "STATE", "COMPARE", "SEARCH", "FLOW", "EXECUTION"):
            assert intent in INTENT_TO_TEMPLATE

    def test_why_maps_to_t_why(self):
        assert INTENT_TO_TEMPLATE["WHY"] == "T-WHY"

    def test_execution_maps_to_t_execution(self):
        assert INTENT_TO_TEMPLATE["EXECUTION"] == "T-EXECUTION"


class TestSearchIntents:
    def test_compare_is_search_intent(self):
        assert "COMPARE" in SEARCH_INTENTS

    def test_search_is_search_intent(self):
        assert "SEARCH" in SEARCH_INTENTS

    def test_flow_is_search_intent(self):
        assert "FLOW" in SEARCH_INTENTS

    def test_why_is_not_search_intent(self):
        assert "WHY" not in SEARCH_INTENTS

    def test_state_is_not_search_intent(self):
        assert "STATE" not in SEARCH_INTENTS

    def test_execution_is_not_search_intent(self):
        assert "EXECUTION" not in SEARCH_INTENTS


class TestRouteResponse:
    def test_route_search_intent_no_capture(self):
        from viz.intent_router import route
        result = route(intent="SEARCH", symbol="BTCUSDT")
        assert result.intent == "SEARCH"
        assert result.template == "T-SEARCH"
        assert result.search_triggered is True

    def test_route_why_without_capture_returns_data(self):
        from viz.intent_router import route
        # No capture_id → data will have error, but response shape is valid
        result = route(intent="WHY", capture_id=None)
        assert result.intent == "WHY"
        assert result.template == "T-WHY"
        assert result.search_triggered is False

    def test_route_compare_triggers_search(self):
        from viz.intent_router import route
        result = route(intent="COMPARE", capture_id="abc123")
        assert result.search_triggered is True
        assert result.template == "T-COMPARE"

    def test_route_text_classification(self):
        from viz.intent_router import route
        result = route(text_input="왜 valid야?")
        assert result.intent == "WHY"

    def test_route_confidence_present(self):
        from viz.intent_router import route
        result = route(intent="STATE")
        assert 0.0 <= result.confidence <= 1.0
