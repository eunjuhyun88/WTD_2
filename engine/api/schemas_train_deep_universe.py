"""Schemas for /train, /deep, and /universe endpoints."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from api.schemas_shared import KlineBar, TradeRecord


class TrainRequest(BaseModel):
    records: list[TradeRecord] = Field(..., min_length=20)
    user_id: Optional[str] = None


class TrainResponse(BaseModel):
    auc: float
    n_samples: int
    model_version: str


class DeepPerpData(BaseModel):
    fr: Optional[float] = None
    oi_pct: Optional[float] = None
    ls_ratio: Optional[float] = None
    taker_ratio: Optional[float] = None
    price_pct: Optional[float] = None
    oi_notional: Optional[float] = None
    vol_24h: Optional[float] = None
    mark_price: Optional[float] = None
    index_price: Optional[float] = None
    short_liq_usd: float = 0.0
    long_liq_usd: float = 0.0


class DeepRequest(BaseModel):
    symbol: str
    klines: list[KlineBar] = Field(..., min_length=1)
    perp: DeepPerpData = Field(default_factory=DeepPerpData)


class LayerOut(BaseModel):
    score: float
    sigs: list[dict[str, str]]
    meta: dict[str, Any]


class DeepResponse(BaseModel):
    symbol: str
    total_score: float
    verdict: str
    layers: dict[str, LayerOut]
    atr_levels: dict[str, Any]
    alpha: Optional[dict[str, Any]] = None
    hunt_score: Optional[int] = None


class TokenInfo(BaseModel):
    rank: int
    symbol: str
    base: str
    name: str
    sector: str
    price: float
    pct_24h: float
    vol_24h_usd: float
    market_cap: float
    oi_usd: float
    is_futures: bool
    trending_score: float


class UniverseResponse(BaseModel):
    total: int
    tokens: list[TokenInfo]
    updated_at: str
