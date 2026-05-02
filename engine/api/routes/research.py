"""W-0317: POST /research/validate — manual validation trigger.
W-0316: POST /research/discover  — discovery agent trigger (stub, implemented in W-0316).
W-0361: POST /research/autoresearch/trigger, GET /research/signals/{symbol},
        GET /research/runs/{run_id}
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import timezone
from functools import lru_cache
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from api.limiter import limiter
from api.schemas_search import MarketSearchRequest, MarketSearchResponse

log = logging.getLogger("engine.api.research")

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


# --- W-0367: Alpha Quality Endpoints ---

@router.get("/alpha-quality")  # W-0367
async def get_alpha_quality(
    lookback: str = "30d",
    pattern_slug: str | None = None,
):
    """GET /research/alpha-quality — Welch+BH-FDR+Spearman alpha quality report."""
    import re
    from fastapi import HTTPException
    m = re.match(r"^(\d+)d$", lookback)
    if not m:
        raise HTTPException(status_code=422, detail="lookback must be Nd format e.g. 30d")
    days = int(m.group(1))
    if not 1 <= days <= 365:
        raise HTTPException(status_code=422, detail="lookback must be 1d–365d")
    from research.alpha_quality import aggregate
    return aggregate(lookback_days=days, pattern_slug=pattern_slug)


# ---------------------------------------------------------------------------
# W-0365: POST /research/market-search
# ---------------------------------------------------------------------------

@router.post("/market-search")
async def market_search(req: MarketSearchRequest) -> MarketSearchResponse:
    """W-0365: Run pattern market search and return ranked candidates."""
    import time
    import uuid

    start = time.perf_counter()
    try:
        from research.market_retrieval import run_pattern_market_search
        result = await asyncio.to_thread(
            run_pattern_market_search,
            pattern_slug=req.pattern_slug,
            variant_slug=req.variant_slug,
            timeframe=req.timeframe,
            universe=req.universe,
            top_k=req.top_k,
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    elapsed_ms = (time.perf_counter() - start) * 1000

    no_reason: str | None = None
    if not result.candidates:
        if result.retrieval_source != "index":
            no_reason = "market_index_not_built"
        elif result.universe_size == 0:
            no_reason = "universe_empty"
        else:
            no_reason = "no_similar_pattern_found"

    return MarketSearchResponse(
        run_id=str(uuid.uuid4()),
        pattern_slug=req.pattern_slug,
        candidates=[c.to_dict() for c in result.candidates],
        total_candidates=len(result.candidates),
        retrieval_source=result.retrieval_source,
        run_type=req.run_type,
        elapsed_ms=elapsed_ms,
        no_candidates_reason=no_reason,
    )


# ---------------------------------------------------------------------------
# W-0366 T5: GET /research/indicator-features
# ---------------------------------------------------------------------------

@router.get("/indicator-features")
async def get_indicator_features():
    """W-0366: Return user-facing indicator feature catalog for UI."""
    from research.feature_catalog import USER_FACING_FEATURES
    return {
        name: {
            "label": meta.label,
            "unit": meta.unit,
            "operators": list(meta.operators),
            "value_type": meta.value_type,
            "category": meta.category,
            "range": list(meta.range) if meta.range else None,
            "enum_values": list(meta.enum_values) if meta.enum_values else None,
            "description": meta.description,
        }
        for name, meta in USER_FACING_FEATURES.items()
    }


@router.get("/signals/{signal_id}/components")
async def get_signal_components(signal_id: str):
    """GET /research/signals/{signal_id}/components — component_scores for a signal event."""
    import uuid as _uuid
    from fastapi import HTTPException
    try:
        _uuid.UUID(signal_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="signal_id must be a valid UUID")
    from research.signal_event_store import fetch_signal_components
    data = fetch_signal_components(signal_id)
    if data is None:
        raise HTTPException(status_code=404, detail="signal not found")
    return data


# ── W-0352: GET /research/top-patterns ──────────────────────────────────────

REQUIRED_COLUMNS = {
    "pattern", "symbol", "direction", "n_signals", "n_executed",
    "win_rate", "expectancy_pct", "sharpe", "calmar",
    "max_drawdown_pct", "final_equity", "scan_ts",
    "composite_score", "quality_grade",
}

GRADE_ORDER = {"S": 4, "A": 3, "B": 2, "C": 1}


class TopPatternItem(BaseModel):
    pattern_slug: str
    symbol: Optional[str]
    direction: Optional[str]
    composite_score: Optional[float]
    quality_grade: Optional[str]
    n_trades_paper: Optional[int]
    win_rate_paper: Optional[float]
    sharpe_paper: Optional[float]
    max_drawdown_pct_paper: Optional[float]
    expectancy_pct_paper: Optional[float]
    model_source: Optional[str] = None


class TopPatternsResponse(BaseModel):
    patterns: list[TopPatternItem]
    generated_at: Optional[str]
    pipeline_run_id: Optional[str]
    total_available: int
    limit_applied: int


@lru_cache(maxsize=4)
def _load_parquet_cached(path: str, mtime: float) -> pd.DataFrame:
    return pd.read_parquet(path)


try:
    from pipeline import latest_top_patterns_path
except ImportError:  # pragma: no cover — only missing outside engine context
    latest_top_patterns_path = None  # type: ignore[assignment]


@router.get("/top-patterns", response_model=TopPatternsResponse)
def get_top_patterns(
    limit: int = Query(default=20, ge=1),
    min_grade: str = Query(default="B", pattern="^[SABC]$"),
) -> TopPatternsResponse:
    limit_applied = min(limit, 100)

    path = latest_top_patterns_path()
    if path is None:
        return TopPatternsResponse(
            patterns=[],
            generated_at=None,
            pipeline_run_id=None,
            total_available=0,
            limit_applied=limit_applied,
        )

    try:
        mtime = path.stat().st_mtime
        df = _load_parquet_cached(str(path), mtime)
    except Exception as exc:
        log.warning("top-patterns: failed to read parquet %s: %s", path, exc)
        return TopPatternsResponse(
            patterns=[],
            generated_at=None,
            pipeline_run_id=None,
            total_available=0,
            limit_applied=limit_applied,
        )

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Pipeline parquet missing columns: {sorted(missing)}",
        )

    df = df.dropna(subset=["composite_score", "quality_grade"])

    min_rank = GRADE_ORDER.get(min_grade, 2)
    df = df[df["quality_grade"].map(lambda g: GRADE_ORDER.get(g, 0)) >= min_rank]

    total_available = len(df)

    if len(df) > 1:
        df = df.sort_values("composite_score", ascending=False, kind="mergesort")

    df = df.head(limit_applied)

    sa_ratio = (df["quality_grade"].isin(["S", "A"]).sum() / max(total_available, 1))
    if sa_ratio > 0.5:
        log.warning("top-patterns: S+A ratio %.0f%% > 50%% — possible score inflation", sa_ratio * 100)

    generated_at = (
        __import__("datetime").datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
    )
    pipeline_run_id = path.stem.replace("results_", "")

    model_source_col = "model_source" if "model_source" in df.columns else None

    items = [
        TopPatternItem(
            pattern_slug=str(row["pattern"]),
            symbol=row.get("symbol") or None,
            direction=row.get("direction") or None,
            composite_score=float(row["composite_score"]) if pd.notna(row.get("composite_score")) else None,
            quality_grade=str(row["quality_grade"]) if pd.notna(row.get("quality_grade")) else None,
            n_trades_paper=int(row["n_executed"]) if pd.notna(row.get("n_executed")) else None,
            win_rate_paper=float(row["win_rate"]) if pd.notna(row.get("win_rate")) else None,
            sharpe_paper=float(row["sharpe"]) if pd.notna(row.get("sharpe")) else None,
            max_drawdown_pct_paper=float(row["max_drawdown_pct"]) if pd.notna(row.get("max_drawdown_pct")) else None,
            expectancy_pct_paper=float(row["expectancy_pct"]) if pd.notna(row.get("expectancy_pct")) else None,
            model_source=str(row[model_source_col]) if model_source_col and pd.notna(row.get(model_source_col)) else None,
        )
        for _, row in df.iterrows()
    ]

    return TopPatternsResponse(
        patterns=items,
        generated_at=generated_at,
        pipeline_run_id=pipeline_run_id,
        total_available=total_available,
        limit_applied=limit_applied,
    )


# ---------------------------------------------------------------------------
# W-0385: GET /research/formula-evidence
# ---------------------------------------------------------------------------

class FormulaEvidenceItem(BaseModel):
    scope_kind: str
    scope_value: str
    sample_n: int | None = None
    blocked_winner_rate: float | None = None
    good_block_rate: float | None = None
    drag_score: float | None = None
    avg_missed_pnl: float | None = None
    computed_at: str | None = None


@router.get("/formula-evidence", response_model=list[FormulaEvidenceItem])
async def get_formula_evidence(
    scope: str = Query("filter_rule", description="filter_rule | pattern"),
    period_days: int = Query(30, ge=1, le=365),
    min_sample: int = Query(10, ge=1),
) -> list[FormulaEvidenceItem]:
    """Return formula evidence rows sorted by drag_score DESC.

    drag_score (bps) = blocked_winner_rate × avg_missed_pnl — how much
    alpha each filter rule has cost us in the last period_days.
    """
    import os as _os
    from supabase import create_client
    from datetime import datetime as _dt, timedelta as _td

    sb = create_client(
        _os.environ["SUPABASE_URL"],
        _os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    cutoff = (_dt.now(__import__("datetime").timezone.utc) - _td(days=period_days)).isoformat()

    rows = (
        sb.table("formula_evidence")
        .select("scope_kind, scope_value, sample_n, blocked_winner_rate, good_block_rate, drag_score, avg_missed_pnl, computed_at")
        .eq("scope_kind", scope)
        .gte("computed_at", cutoff)
        .gte("sample_n", min_sample)
        .order("drag_score", desc=True)
        .limit(200)
        .execute()
        .data
    )

    return [FormulaEvidenceItem(**r) for r in rows]


# ---------------------------------------------------------------------------
# W-0385: GET /research/blocked-candidates
# ---------------------------------------------------------------------------

class BlockedCandidateItem(BaseModel):
    id: str | None = None
    symbol: str | None = None
    timeframe: str | None = None
    direction: str | None = None
    reason: str | None = None
    score: float | None = None
    p_win: float | None = None
    source: str | None = None
    pattern_slug: str | None = None
    forward_1h: float | None = None
    forward_4h: float | None = None
    forward_24h: float | None = None
    forward_72h: float | None = None
    blocked_at: str | None = None


@router.get("/blocked-candidates", response_model=list[BlockedCandidateItem])
async def get_blocked_candidates(
    reason: str | None = Query(None, description="Filter by filter_reason code"),
    symbol: str | None = Query(None, description="Filter by symbol"),
    period_days: int = Query(30, ge=1, le=365),
    limit: int = Query(100, ge=1, le=500),
) -> list[BlockedCandidateItem]:
    """Return blocked_candidates rows, optionally filtered by reason/symbol."""
    import os as _os
    from supabase import create_client
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz

    sb = create_client(
        _os.environ["SUPABASE_URL"],
        _os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

    cutoff = (_dt.now(_tz.utc) - _td(days=period_days)).isoformat()

    q = (
        sb.table("blocked_candidates")
        .select("id, symbol, timeframe, direction, reason, score, p_win, source, pattern_slug, forward_1h, forward_4h, forward_24h, forward_72h, blocked_at")
        .gte("blocked_at", cutoff)
        .order("blocked_at", desc=True)
        .limit(limit)
    )
    if reason:
        q = q.eq("reason", reason)
    if symbol:
        q = q.eq("symbol", symbol.upper())

    rows = q.execute().data
    return [BlockedCandidateItem(**r) for r in rows]
