"""Schemas for /score endpoint."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from api.schemas_shared import KlineBar, PerpSnapshot


class ScoreRequest(BaseModel):
    symbol: str
    klines: list[KlineBar] = Field(..., min_length=1)
    perp: PerpSnapshot = Field(default_factory=PerpSnapshot)


class EnsembleSignal(BaseModel):
    direction: str
    ensemble_score: float
    ml_contribution: float
    block_contribution: float
    regime_contribution: float
    confidence: str
    reason: str
    block_analysis: dict[str, Any]


class ScoreResponse(BaseModel):
    snapshot: dict[str, Any]
    p_win: Optional[float]
    blocks_triggered: list[str]
    ensemble: Optional[EnsembleSignal] = None
    ensemble_triggered: bool = False
