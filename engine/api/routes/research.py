"""W-0317: POST /research/validate — manual validation trigger.
W-0316: POST /research/discover  — discovery agent trigger (stub, implemented in W-0316).
"""
from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /research/validate
# ---------------------------------------------------------------------------

class ValidateRequest(BaseModel):
    slug: str
    symbol: str
    timeframe: str
    family: str | None = None
    existing_promotion_pass: bool = False


class ValidateResponse(BaseModel):
    slug: str
    overall_pass: bool
    stage: str
    hypothesis_id: str | None
    dsr_n_trials: int
    family: str
    computed_at: str
    error: str | None
    gate: dict | None


@router.post("/validate", response_model=ValidateResponse)
async def validate_pattern(req: ValidateRequest) -> ValidateResponse:
    """Run validate_and_gate() for a pattern slug.

    Rate limit: 20/day (enforced by caller middleware).
    503 if VALIDATION_PIPELINE_ENABLED=false.
    """
    if os.environ.get("VALIDATION_PIPELINE_ENABLED", "true").lower() == "false":
        raise HTTPException(status_code=503, detail="VALIDATION_PIPELINE_ENABLED=false")

    try:
        from research.pattern_search import ReplayBenchmarkPack
        from research.validation.facade import validate_and_gate
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Import error: {e}") from e

    family = req.family or f"{req.symbol.lower()}_{req.timeframe.lower()}"

    # Build a minimal pack — in production this comes from the pattern store
    try:
        from research.pattern_search import _get_pattern_pack  # type: ignore[attr-defined]
        pack: ReplayBenchmarkPack = _get_pattern_pack(req.slug)
    except Exception:
        # Fallback: build empty pack for the slug (validation will return insufficient)
        pack = ReplayBenchmarkPack(pattern_slug=req.slug, cases=[])

    result = validate_and_gate(
        slug=req.slug,
        pack=pack,
        family=family,
        existing_promotion_pass=req.existing_promotion_pass,
    )

    return ValidateResponse(**result.to_dict())


# ---------------------------------------------------------------------------
# POST /research/discover (W-0316 stub — wired in W-0316 impl)
# ---------------------------------------------------------------------------

class DiscoverResponse(BaseModel):
    message: str = Field(default="W-0316 not yet implemented")


@router.post("/discover", response_model=DiscoverResponse)
async def discover() -> DiscoverResponse:
    """Trigger autonomous pattern discovery agent (W-0316)."""
    if os.environ.get("DISCOVERY_AGENT_ENABLED", "true").lower() == "false":
        raise HTTPException(status_code=503, detail="DISCOVERY_AGENT_ENABLED=false")
    return DiscoverResponse()
