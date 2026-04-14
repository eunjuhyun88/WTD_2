"""Schemas for /backtest endpoint."""
from __future__ import annotations

from pydantic import BaseModel, Field

from api.schemas_shared import BacktestConfig, BlockSet


class BacktestRequest(BaseModel):
    blocks: BlockSet
    config: BacktestConfig = Field(default_factory=BacktestConfig)


class BacktestMetrics(BaseModel):
    n_trades: int
    win_rate: float
    expectancy: float
    profit_factor: float
    max_drawdown: float
    sortino: float
    walk_forward_pass_rate: float


class BacktestResponse(BaseModel):
    metrics: BacktestMetrics
    passed: bool
    gate_failures: list[str]
