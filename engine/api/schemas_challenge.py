"""Schemas for /challenge endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from api.schemas_shared import SnapInput


class ChallengeCreateRequest(BaseModel):
    snaps: list[SnapInput] = Field(..., min_length=1, max_length=5)
    user_id: Optional[str] = None


class StrategyResult(BaseModel):
    name: str
    win_rate: float
    match_count: int
    expectancy: float


class ChallengeCreateResponse(BaseModel):
    slug: str
    strategies: list[StrategyResult]
    recommended: str
    feature_vector: list[float]


class ScanMatch(BaseModel):
    symbol: str
    timestamp: datetime
    similarity: float
    p_win: Optional[float]
    price: float


class ChallengeScanResponse(BaseModel):
    slug: str
    scanned_at: datetime
    matches: list[ScanMatch]
