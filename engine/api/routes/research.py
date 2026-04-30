"""W-0317: POST /research/validate — manual validation trigger.
W-0316: POST /research/discover  — discovery agent trigger (stub, implemented in W-0316).
"""
from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from api.limiter import limiter

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
@limiter.limit("20/day")
async def validate_pattern(request: Request, req: ValidateRequest) -> ValidateResponse:
    """Run validate_and_gate() for a pattern slug.

    Rate limit: 20/day per IP.
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
    cycle_id: str
    proposals: int
    turns_used: int
    stop_reason: str | None
    error: str | None
    proposal_paths: list[str]


@router.post("/discover", response_model=DiscoverResponse)
@limiter.limit("5/day")
async def discover(request: Request) -> DiscoverResponse:
    """Trigger autonomous pattern discovery agent (W-0316).

    Internal-only: requires x-engine-internal-secret header.
    Rate limit: 5/day. Discovery runs cost up to $0.50/cycle.
    503 if DISCOVERY_AGENT_ENABLED=false.
    """
    secret = os.environ.get("ENGINE_INTERNAL_SECRET", "")
    if not secret or request.headers.get("x-engine-internal-secret", "") != secret:
        raise HTTPException(status_code=403, detail="Internal endpoint")

    if os.environ.get("DISCOVERY_AGENT_ENABLED", "true").lower() == "false":
        raise HTTPException(status_code=503, detail="DISCOVERY_AGENT_ENABLED=false")

    try:
        from research.discovery_agent import run_discovery_cycle
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Import error: {e}") from e

    result = await run_discovery_cycle()
    return DiscoverResponse(
        cycle_id=result.cycle_id,
        proposals=len(result.proposals),
        turns_used=result.turns_used,
        stop_reason=result.stop_reason,
        error=result.error,
        proposal_paths=result.proposals,
    )


class FindingsResponse(BaseModel):
    date: str
    findings: list[str]
    count: int


@router.get("/findings", response_model=FindingsResponse)
@limiter.limit("60/hour")
async def list_findings(request: Request, date: str | None = None) -> FindingsResponse:
    """List inbox findings. date format: YYYY-MM-DD."""
    from research.finding_store import list_findings as _list
    from datetime import date as _date

    target_date = date or str(_date.today())
    paths = _list(date=target_date)
    return FindingsResponse(
        date=target_date,
        findings=[p.name for p in paths],
        count=len(paths),
    )
