"""Viz Intent Router — Response templates for 6 intent types (F-17)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

VizIntent = Literal["WHY", "STATE", "COMPARE", "SEARCH", "FLOW", "EXECUTION"]
VizTemplateId = Literal["T-WHY", "T-STATE", "T-COMPARE", "T-SEARCH", "T-FLOW", "T-EXECUTION"]

INTENT_TO_TEMPLATE: dict[VizIntent, VizTemplateId] = {
    "WHY": "T-WHY",
    "STATE": "T-STATE",
    "COMPARE": "T-COMPARE",
    "SEARCH": "T-SEARCH",
    "FLOW": "T-FLOW",
    "EXECUTION": "T-EXECUTION",
}

# Intents that trigger the search pipeline
SEARCH_INTENTS: frozenset[VizIntent] = frozenset({"COMPARE", "SEARCH", "FLOW"})


@dataclass
class VizResponse:
    intent: VizIntent
    template: VizTemplateId
    confidence: float
    data: dict[str, Any] = field(default_factory=dict)
    search_triggered: bool = False
    error: str | None = None
