"""Viz Intent Router API — F-17.

POST /viz/route — classify intent and return visualization data.
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel

log = logging.getLogger("engine.api.viz")
router = APIRouter()

VizIntent = Literal["WHY", "STATE", "COMPARE", "SEARCH", "FLOW", "EXECUTION"]


class _VizRouteBody(BaseModel):
    capture_id: str | None = None
    intent: VizIntent | None = None
    text_input: str | None = None
    symbol: str | None = None


@router.post("/route")
async def route_viz_intent(body: _VizRouteBody, request: Request) -> dict:
    """Classify visualization intent and return template + data.

    - WHY/STATE/EXECUTION: no search, returns capture context data.
    - SEARCH/COMPARE/FLOW: returns search_triggered=True + routing info.
      Client should follow up with GET /search/similar?capture_id=...
    """
    from viz.intent_router import route

    result = route(
        capture_id=body.capture_id,
        intent=body.intent,
        text_input=body.text_input,
        symbol=body.symbol,
    )

    return {
        "intent": result.intent,
        "template": result.template,
        "confidence": result.confidence,
        "search_triggered": result.search_triggered,
        "data": result.data,
    }
