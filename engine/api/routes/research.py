"""W-0317: POST /research/validate — manual validation trigger.
W-0316: POST /research/discover  — discovery agent trigger (stub, implemented in W-0316).
W-0361: POST /research/autoresearch/trigger, GET /research/signals/{symbol},
        GET /research/runs/{run_id}
"""
from __future__ import annotations

import asyncio
import os

from fastapi import APIRouter, HTTPException, Query, Request
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


# ---------------------------------------------------------------------------
# W-0361: POST /research/autoresearch/trigger
# ---------------------------------------------------------------------------

class AutoresearchTriggerResponse(BaseModel):
    status: str
    run_id: str | None = None
    n_symbols: int | None = None
    n_promoted: int | None = None
    n_written: int | None = None
    elapsed_s: float | None = None
    reason: str | None = None
    error: str | None = None


@router.post("/autoresearch/trigger", response_model=AutoresearchTriggerResponse)
async def trigger_autoresearch(request: Request) -> AutoresearchTriggerResponse:
    """Manually trigger one autoresearch cycle (admin-only).

    Requires X-API-Key header matching ENGINE_API_KEY env var.
    Returns immediately with run summary (runs synchronously in thread).
    """
    api_key = os.environ.get("ENGINE_API_KEY", "")
    if not api_key or request.headers.get("x-api-key", "") != api_key:
        raise HTTPException(status_code=403, detail="X-API-Key required")

    if os.environ.get("AUTORESEARCH_ENABLED", "false").lower() != "true":
        raise HTTPException(status_code=503, detail="AUTORESEARCH_ENABLED=false")

    try:
        from research.autoresearch_runner import run_once
        result = await asyncio.to_thread(run_once)
        return AutoresearchTriggerResponse(**{k: v for k, v in result.items() if k in AutoresearchTriggerResponse.model_fields})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# W-0361: GET /research/signals/{symbol}
# ---------------------------------------------------------------------------

class SignalOut(BaseModel):
    symbol: str
    pattern: str
    timeframe: str
    sharpe: float | None
    hit_rate: float | None
    n_trades: int | None
    promoted_at: str
    expires_at: str


class SignalsResponse(BaseModel):
    symbol: str
    signals: list[SignalOut]
    count: int


@router.get("/signals/{symbol}", response_model=SignalsResponse)
@limiter.limit("120/hour")
async def get_signals(
    request: Request,
    symbol: str,
    lookback: str = Query("24h", description="e.g. 1h, 6h, 24h, 7d"),
) -> SignalsResponse:
    """Return active promoted signals for a symbol.

    Filters to signals with expires_at > now AND promoted_at > now - lookback.
    """
    from datetime import datetime, timezone
    import re

    symbol = symbol.upper()
    now = datetime.now(timezone.utc)

    # Parse lookback string
    m = re.fullmatch(r"(\d+)(h|d)", lookback)
    if not m:
        raise HTTPException(status_code=400, detail="lookback format: Nh or Nd (e.g. 24h, 7d)")
    val, unit = int(m.group(1)), m.group(2)
    from datetime import timedelta
    delta = timedelta(hours=val) if unit == "h" else timedelta(days=val)
    since = (now - delta).isoformat()

    try:
        from supabase import create_client
        c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        resp = (
            c.table("pattern_signals")
            .select("symbol,pattern,timeframe,sharpe,hit_rate,n_trades,promoted_at,expires_at")
            .eq("symbol", symbol)
            .gt("expires_at", now.isoformat())
            .gt("promoted_at", since)
            .order("sharpe", desc=True)
            .limit(100)
            .execute()
        )
        signals = [SignalOut(**row) for row in resp.data]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return SignalsResponse(symbol=symbol, signals=signals, count=len(signals))


# ---------------------------------------------------------------------------
# W-0361: GET /research/runs/{run_id}
# ---------------------------------------------------------------------------

class RunOut(BaseModel):
    run_id: str
    started_at: str
    finished_at: str | None
    status: str
    n_symbols: int
    n_patterns: int
    n_promoted: int
    elapsed_s: float | None
    error_msg: str | None


@router.get("/runs/{run_id}", response_model=RunOut)
@limiter.limit("120/hour")
async def get_run(request: Request, run_id: str) -> RunOut:
    """Return status of a specific autoresearch run."""
    try:
        from supabase import create_client
        c = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        resp = c.table("autoresearch_runs").select("*").eq("run_id", run_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not resp.data:
        raise HTTPException(status_code=404, detail=f"run_id={run_id} not found")
    return RunOut(**resp.data[0])


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
