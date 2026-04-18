"""POST /deep — full market_engine pipeline (L2 DeepResult).

`ensure_fresh_ctx()` stays async on the event loop; `run_deep_analysis` and
serialization run in a worker thread (`asyncio.to_thread`).
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request

from api.limiter import limiter
from api.schemas import DeepRequest, DeepResponse
from api.routes.deep_thread import deep_sync
from market_engine.ctx_cache import ensure_fresh_ctx

router = APIRouter()

_MIN_KLINES = 120


@router.post("", response_model=DeepResponse)
@limiter.limit("30/minute")
async def deep(request: Request, req: DeepRequest) -> DeepResponse:
    """Run all L2 market_engine indicators for a single symbol."""
    if len(req.klines) < _MIN_KLINES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Need ≥{_MIN_KLINES} kline bars for full indicator suite "
                f"(got {len(req.klines)}). Send the 1H stream at limit=500 for best results."
            ),
        )

    ctx = await ensure_fresh_ctx()
    return await asyncio.to_thread(deep_sync, req, ctx)
