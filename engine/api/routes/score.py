"""POST /score — klines + perp snapshot → SignalSnapshot + P(win).

Heavy CPU (pandas, feature_calc, LightGBM, blocks) runs in a worker thread
via `asyncio.to_thread` so the event loop stays responsive.

In-process TTL cache (30s) keyed on (symbol, last_bar_ts_ms) avoids
repeated LightGBM + feature_calc for the same bar when multiple clients
score the same symbol concurrently.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request

from api.limiter import limiter
from api.schemas import ScoreRequest, ScoreResponse
from api.routes.score_thread import score_sync
from api.score_cache import get_score_cache, set_score_cache
from scanner.feature_calc import MIN_HISTORY_BARS

router = APIRouter()


@router.post("", response_model=ScoreResponse)
@limiter.limit("60/minute")
async def score(request: Request, req: ScoreRequest) -> ScoreResponse:
    """Compute features + ML score for the latest bar."""
    if len(req.klines) < MIN_HISTORY_BARS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Need ≥{MIN_HISTORY_BARS} kline bars for stable features "
                f"(got {len(req.klines)}). Send more history."
            ),
        )

    last_bar_ts = req.klines[-1].t
    cached = get_score_cache(req.symbol, last_bar_ts)
    if cached is not None:
        return cached

    result = await asyncio.to_thread(score_sync, req)
    set_score_cache(req.symbol, last_bar_ts, result)
    return result
