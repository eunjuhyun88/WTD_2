"""Challenge endpoints — pattern registration and real-time scan.

POST /challenge/create
  - Accepts 1–5 (symbol, timestamp) snaps from the user
  - Loads historical features from cache
  - Builds extended pattern vector
  - Runs 3 competing refinement strategies
  - Saves ChallengeRecord to disk
  - Returns strategies + recommended

GET /challenge/{slug}/scan
  - Loads the saved challenge
  - Scores all current universe bars against the pattern
  - Returns top matches with similarity + P(win)

Heavy work runs in a worker thread (`asyncio.to_thread`) so the asyncio
event loop stays responsive for other HTTP clients.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter

from api.schemas import (
    ChallengeCreateRequest,
    ChallengeCreateResponse,
    ChallengeScanResponse,
)
from api.routes.challenge_thread import create_challenge_sync, scan_challenge_sync

router = APIRouter()


@router.post("/create", response_model=ChallengeCreateResponse)
async def create_challenge(req: ChallengeCreateRequest) -> ChallengeCreateResponse:
    """Register a new challenge from 1–5 reference snaps."""
    return await asyncio.to_thread(create_challenge_sync, req)


@router.get("/{slug}/scan", response_model=ChallengeScanResponse)
async def scan_challenge(slug: str) -> ChallengeScanResponse:
    """Find current universe bars that match the saved challenge pattern."""
    return await asyncio.to_thread(scan_challenge_sync, slug)
