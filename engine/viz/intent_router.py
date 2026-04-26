"""Viz Intent Router — F-17.

Routes user intent to the correct template + data fetch strategy.

Intent taxonomy (03_SEARCH_ENGINE.md §2):
  WHY       — why this capture is valid/invalid (no search)
  STATE     — current phase state of a symbol/capture (no search)
  COMPARE   — side-by-side comparison (search pipeline)
  SEARCH    — find similar captures (search pipeline)
  FLOW      — OI/funding flow comparison (search pipeline)
  EXECUTION — entry/exit guidance for current capture (no search)

Phase 1: rule-based IntentClassifier (keyword matching).
Phase 2: LLM-based classification via A-03 AI Parser.
"""
from __future__ import annotations

import logging
import re
from typing import Any

from viz.templates import (
    INTENT_TO_TEMPLATE,
    SEARCH_INTENTS,
    VizIntent,
    VizResponse,
)

log = logging.getLogger("engine.viz.intent_router")

# ── Rule-based keyword classifier ─────────────────────────────────────────

_INTENT_KEYWORDS: list[tuple[VizIntent, list[str]]] = [
    ("WHY",       ["왜", "why", "근거", "이유", "valid", "invalid", "판단"]),
    ("EXECUTION", ["언제", "진입", "when", "entry", "exit", "tp", "sl", "r:r", "리스크"]),
    ("STATE",     ["상태", "state", "지금", "now", "현재", "phase", "페이즈"]),
    ("FLOW",      ["oi", "funding", "흐름", "flow", "자금", "청산"]),
    ("COMPARE",   ["비교", "compare", "vs", "랑", "같은"]),
    ("SEARCH",    ["찾아", "search", "비슷한", "similar", "같은 패턴"]),
]


def _classify_intent(text: str | None, explicit_intent: VizIntent | None) -> tuple[VizIntent, float]:
    """Return (intent, confidence). Explicit intent wins."""
    if explicit_intent:
        return explicit_intent, 1.0
    if not text:
        return "SEARCH", 0.5  # default fallback

    lower = text.lower()
    for intent, keywords in _INTENT_KEYWORDS:
        if any(kw in lower for kw in keywords):
            return intent, 0.85
    return "SEARCH", 0.5


# ── Context fetchers (no-search intents) ──────────────────────────────────

def _fetch_why_data(capture_id: str) -> dict[str, Any]:
    """WHY: feature importance from entry_block_scores + outcome history."""
    try:
        from capture.store import CaptureStore
        store = CaptureStore()
        capture = store.load(capture_id)
        if capture is None:
            return {"error": f"capture {capture_id} not found"}

        feature_snapshot = capture.feature_snapshot or {}
        # Top 10 features by absolute value as importance proxy
        top_features = sorted(
            [(k, v) for k, v in feature_snapshot.items() if isinstance(v, (int, float))],
            key=lambda x: abs(x[1]),
            reverse=True,
        )[:10]

        return {
            "capture_id": capture_id,
            "symbol": capture.symbol,
            "pattern_slug": capture.pattern_slug,
            "top_features": [{"name": k, "value": v} for k, v in top_features],
            "phase": capture.phase,
            "status": capture.status,
        }
    except Exception as exc:
        log.warning("WHY fetch error for %s: %s", capture_id, exc)
        return {"error": str(exc)}


def _fetch_state_data(capture_id: str) -> dict[str, Any]:
    """STATE: current phase + status + outcome if resolved."""
    try:
        from capture.store import CaptureStore
        store = CaptureStore()
        capture = store.load(capture_id)
        if capture is None:
            return {"error": f"capture {capture_id} not found"}

        return {
            "capture_id": capture_id,
            "symbol": capture.symbol,
            "pattern_slug": capture.pattern_slug,
            "phase": capture.phase,
            "status": capture.status,
            "outcome_id": capture.outcome_id,
            "user_verdict": getattr(capture, "user_verdict", None),
        }
    except Exception as exc:
        log.warning("STATE fetch error for %s: %s", capture_id, exc)
        return {"error": str(exc)}


def _fetch_execution_data(capture_id: str) -> dict[str, Any]:
    """EXECUTION: entry levels and key conditions from capture + pattern policy."""
    try:
        from capture.store import CaptureStore
        store = CaptureStore()
        capture = store.load(capture_id)
        if capture is None:
            return {"error": f"capture {capture_id} not found"}

        snapshot = capture.feature_snapshot or {}
        entry_price = snapshot.get("entry_price") or snapshot.get("close")

        return {
            "capture_id": capture_id,
            "symbol": capture.symbol,
            "pattern_slug": capture.pattern_slug,
            "phase": capture.phase,
            "entry_price": entry_price,
            "timeframe": snapshot.get("timeframe"),
            "note": "TP/SL targets require pattern policy — Phase 2",
        }
    except Exception as exc:
        log.warning("EXECUTION fetch error for %s: %s", capture_id, exc)
        return {"error": str(exc)}


def _fetch_search_data(intent: VizIntent, capture_id: str | None, symbol: str | None) -> dict[str, Any]:
    """SEARCH/COMPARE/FLOW: delegate to /search/similar pipeline."""
    # Phase 1: return routing info only — actual search via /search/similar
    return {
        "search_triggered": True,
        "intent": intent,
        "capture_id": capture_id,
        "symbol": symbol,
        "note": "Call /search/similar with capture_id to get results",
    }


# ── Router ─────────────────────────────────────────────────────────────────

def route(
    *,
    capture_id: str | None = None,
    intent: VizIntent | None = None,
    text_input: str | None = None,
    symbol: str | None = None,
) -> VizResponse:
    """Route user intent to the correct template and fetch data.

    Args:
        capture_id: Current capture being viewed.
        intent: Explicit intent override (skips classifier).
        text_input: Natural language input (used by classifier).
        symbol: Target symbol for STATE/SEARCH queries.
    """
    resolved_intent, confidence = _classify_intent(text_input, intent)
    template = INTENT_TO_TEMPLATE[resolved_intent]
    search_triggered = resolved_intent in SEARCH_INTENTS

    if resolved_intent == "WHY" and capture_id:
        data = _fetch_why_data(capture_id)
    elif resolved_intent == "STATE":
        data = _fetch_state_data(capture_id or "") if capture_id else {"symbol": symbol}
    elif resolved_intent == "EXECUTION" and capture_id:
        data = _fetch_execution_data(capture_id)
    elif resolved_intent in SEARCH_INTENTS:
        data = _fetch_search_data(resolved_intent, capture_id, symbol)
    else:
        data = {"capture_id": capture_id, "symbol": symbol}

    return VizResponse(
        intent=resolved_intent,
        template=template,
        confidence=confidence,
        data=data,
        search_triggered=search_triggered,
    )
