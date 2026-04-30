"""Schemas for /opportunity endpoints."""
from __future__ import annotations

from pydantic import BaseModel, Field


class OpportunityRunRequest(BaseModel):
    limit: int = Field(default=15, ge=1, le=100)
    user_id: str | None = None


class OpportunityScore(BaseModel):
    symbol: str
    name: str
    slug: str
    price: float
    change1h: float
    change24h: float
    change7d: float
    volume24h: float
    marketCap: float
    momentumScore: int
    volumeScore: int
    socialScore: int
    macroScore: int
    onchainScore: int
    totalScore: int
    direction: str
    confidence: int
    reasons: list[str]
    sentiment: float | None = None
    socialVolume: float | None = None
    galaxyScore: float | None = None
    alerts: list[str]
    compositeScore: float | None = None


class OpportunityMacroBackdrop(BaseModel):
    fedFundsRate: float | None = None
    yieldCurveSpread: float | None = None
    m2ChangePct: float | None = None
    overallMacroScore: float
    regime: str


class OpportunityRunResponse(BaseModel):
    coins: list[OpportunityScore]
    macroBackdrop: OpportunityMacroBackdrop
    scannedAt: int
    scanDurationMs: int
