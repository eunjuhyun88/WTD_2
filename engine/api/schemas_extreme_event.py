"""Pydantic schemas for the /extreme-events endpoint (W-0355)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ExtremeEventOut(BaseModel):
    symbol: str
    kind: str  # funding | oi | price (mapped from event_type)
    magnitude: float
    detected_at: datetime
    outcome_24h: Optional[float] = None
    outcome_48h: Optional[float] = None
    outcome_72h: Optional[float] = None
    is_predictive: Optional[bool] = None


class ExtremeEventsResponse(BaseModel):
    items: list[ExtremeEventOut]
    generated_at: int  # unix ms
