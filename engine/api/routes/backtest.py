"""POST /backtest — building block set → full BacktestResult.

Heavy work (disk I/O, feature tables, bar scan, simulator) runs in a worker
thread via `asyncio.to_thread` so the event loop stays responsive.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter

from api.schemas import BacktestRequest, BacktestResponse
from api.routes.backtest_thread import backtest_sync

router = APIRouter()


@router.post("", response_model=BacktestResponse)
async def backtest(req: BacktestRequest) -> BacktestResponse:
    """Run a portfolio backtest for the given block set over the universe."""
    return await asyncio.to_thread(backtest_sync, req)
