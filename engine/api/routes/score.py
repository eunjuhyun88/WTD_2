"""POST /score — klines + perp snapshot → SignalSnapshot + P(win).

Heavy CPU (pandas, feature_calc, LightGBM, blocks) runs in a worker thread
via `asyncio.to_thread` so the event loop stays responsive.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from api.schemas import ScoreRequest, ScoreResponse
from api.routes.score_thread import score_sync
from scanner.feature_calc import MIN_HISTORY_BARS

router = APIRouter()


@router.post("", response_model=ScoreResponse)
async def score(req: ScoreRequest) -> ScoreResponse:
    """Compute features + ML score for the latest bar."""
    if len(req.klines) < MIN_HISTORY_BARS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Need ≥{MIN_HISTORY_BARS} kline bars for stable features "
                f"(got {len(req.klines)}). Send more history."
            ),
        )
    return await asyncio.to_thread(score_sync, req)
