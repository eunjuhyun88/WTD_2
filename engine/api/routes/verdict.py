"""POST /verdict — evaluate signal outcome from subsequent price bars.

Used by:
  - Auto Verdict (scheduler checks signals after N bars)
  - Lab evaluation (backtest individual signals)
  - Frontend "did this signal work?" button
"""
from __future__ import annotations

from typing import Any, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from scoring.verdict import verdict_from_bars, VerdictOutcome

router = APIRouter()


class VerdictBar(BaseModel):
    """One bar after the signal bar."""
    h: float  # high
    l: float  # low
    c: float  # close


class VerdictRequest(BaseModel):
    entry_price: float
    direction: str = "long"            # "long" | "short"
    bars_after: list[VerdictBar] = Field(..., min_length=1)
    target_pct: float = 0.01           # +1% default
    stop_pct: float = 0.01             # -1% default
    max_bars: int = 24


class VerdictResponse(BaseModel):
    outcome: str        # "hit" | "miss" | "void" | "pending"
    pnl_pct: float
    bars_held: int
    exit_price: float
    max_favorable: float   # MFE
    max_adverse: float     # MAE
    direction: str


@router.post("", response_model=VerdictResponse)
async def verdict(req: VerdictRequest) -> VerdictResponse:
    """Compute auto-verdict for a signal given subsequent bars."""
    bars_df = pd.DataFrame([
        {"high": b.h, "low": b.l, "close": b.c}
        for b in req.bars_after
    ])

    result = verdict_from_bars(
        entry_price=req.entry_price,
        bars=bars_df,
        direction=req.direction,
        target_pct=req.target_pct,
        stop_pct=req.stop_pct,
        max_bars=req.max_bars,
    )

    return VerdictResponse(**result.to_dict())
