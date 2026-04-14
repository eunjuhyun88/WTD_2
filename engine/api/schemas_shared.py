"""Shared schema primitives for engine API routes."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class KlineBar(BaseModel):
    """One normalized OHLCV bar from exchange data."""

    t: int
    o: float
    h: float
    l: float
    c: float
    v: float
    tbv: float = 0.0


class PerpSnapshot(BaseModel):
    """Current-bar derivatives data with neutral-safe defaults."""

    funding_rate: float = 0.0
    oi_change_1h: float = 0.0
    oi_change_24h: float = 0.0
    long_short_ratio: float = 1.0
    taker_buy_ratio: Optional[float] = None


class BlockSet(BaseModel):
    triggers: list[str] = Field(default_factory=list)
    confirmations: list[str] = Field(default_factory=list)
    entries: list[str] = Field(default_factory=list)
    disqualifiers: list[str] = Field(default_factory=list)


class BacktestConfig(BaseModel):
    stop_loss: float = 0.02
    take_profit: float = 0.04
    timeout_bars: int = 24
    universe: str = "binance_30"


class SnapInput(BaseModel):
    symbol: str
    timestamp: datetime
    label: str = ""


class TradeRecord(BaseModel):
    snapshot: dict[str, Any]
    outcome: int
