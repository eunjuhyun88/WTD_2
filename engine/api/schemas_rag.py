"""Schemas for /rag helper endpoints."""
from __future__ import annotations

from pydantic import BaseModel, Field


class RagScanSignal(BaseModel):
    agentId: str
    vote: str
    confidence: float


class RagVectorResponse(BaseModel):
    embedding: list[float] = Field(..., min_length=256, max_length=256)


class RagTerminalScanEmbeddingRequest(BaseModel):
    signals: list[RagScanSignal]
    timeframe: str
    dataCompleteness: float = 0.7


class RagQuickTradeEmbeddingRequest(BaseModel):
    pair: str
    direction: str
    entryPrice: float
    currentPrice: float
    tp: float | None = None
    sl: float | None = None
    source: str
    confidence: float = 50
    timeframe: str = "4h"


class RagSignalActionEmbeddingRequest(BaseModel):
    pair: str
    direction: str
    actionType: str
    confidence: float | None = None
    source: str
    timeframe: str = "4h"


class RagDedupeHashRequest(BaseModel):
    pair: str
    timeframe: str
    direction: str
    regime: str
    source: str
    windowMinutes: int = 60


class RagDedupeHashResponse(BaseModel):
    dedupeHash: str
