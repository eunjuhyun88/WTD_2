"""W-0383: Counterfactual review API routes.

GET /lab/counterfactual?days=30&pattern=ALL&limit=100
    → blocked vs traded distribution data

GET /patterns/{slug}/filter-drag?threshold={0-1}
    → simulated result if filter threshold changed

GET /patterns/{slug}/formula
    → pattern formula with buckets/evidence/suspect rows

These are read-only analytics routes — no production thresholds are mutated.
The engine-side routes are kept minimal: the heavy lifting lives in the SvelteKit
API layer (which queries Supabase directly). The engine routes exist for
internal tooling and direct API consumers.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

log = logging.getLogger("engine.api.routes.counterfactual")

router = APIRouter()


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _supabase_available() -> bool:
    """True if Supabase credentials are configured."""
    return bool(os.environ.get("SUPABASE_URL")) and bool(os.environ.get("SUPABASE_SERVICE_KEY"))


# ---------------------------------------------------------------------------
# GET /lab/counterfactual
# ---------------------------------------------------------------------------

class DistributionStats(BaseModel):
    n: int
    median: float
    iqr: list[float]
    p_win: float
    histogram: list[int]


class WelchTest(BaseModel):
    t: float
    p: float
    df: float | None = None
    insufficient_data: bool = False


class ReasonRow(BaseModel):
    reason: str
    n: int
    median: float
    p_win: float
    delta: float
    verdict: str  # 'keep' | 'relax' | 'inconclusive'


class ForwardReturnRow(BaseModel):
    id: str
    time: str
    symbol: str
    pattern: str | None
    direction: str
    status: str  # 'traded' | 'blocked'
    reason: str | None
    r1h: float | None
    r4h: float | None
    r24h: float | None


class CounterfactualReviewResponse(BaseModel):
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


@router.get("/lab/counterfactual", response_model=CounterfactualReviewResponse, tags=["counterfactual"])
async def get_counterfactual_review(
    days: int = Query(default=30, ge=1, le=365, description="Look-back window in days"),
    pattern: str = Query(default="ALL", description="Pattern slug or ALL"),
    limit: int = Query(default=100, ge=1, le=500, description="Max rows in signal table"),
) -> CounterfactualReviewResponse:
    """Return blocked vs traded distribution data for counterfactual analysis.

    This engine-side endpoint is a thin stub — the primary implementation lives
    in the SvelteKit API layer (`/api/lab/counterfactual`). This route is provided
    for direct engine consumers and internal tooling.

    Returns an empty payload with `outcomes_available: false` when the
    `blocked_candidates` table is unavailable (e.g., local dev without W-0382
    migrations).
    """
    if not _supabase_available():
        log.info("counterfactual: Supabase not configured — returning empty payload")
        return CounterfactualReviewResponse(
            ok=True,
            data={
                "pattern": pattern,
                "horizon": 24,
                "since_days": days,
                "traded": {"n": 0, "median": 0.0, "iqr": [0.0, 0.0], "p_win": 0.0, "histogram": [0] * 20},
                "blocked": {"n": 0, "median": 0.0, "iqr": [0.0, 0.0], "p_win": 0.0, "histogram": [0] * 20},
                "delta_median": 0.0,
                "ci_95": [0.0, 0.0],
                "welch": {"t": 0.0, "p": 1.0, "df": 0.0, "insufficient_data": True},
                "by_reason": [],
                "table": [],
                "outcomes_available": False,
            },
        )

    try:
        from supabase import create_client  # type: ignore[import]

        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        sb = create_client(url, key)

        since_clause = f"blocked_at > now() - interval '{days} days'"
        pattern_clause = "" if pattern == "ALL" else f"AND symbol = '{pattern}'"

        blocked_res = (
            sb.table("blocked_candidates")
            .select("id,symbol,direction,reason,blocked_at,forward_1h,forward_4h,forward_24h")
            .gte("blocked_at", f"now() - interval '{days} days'")
            .limit(limit)
            .execute()
        )
        blocked_rows = blocked_res.data or []

        # Build a minimal by_reason aggregation
        reason_map: dict[str, list[float]] = {}
        for row in blocked_rows:
            v = row.get("forward_24h")
            if v is None:
                continue
            r = row.get("reason", "unknown")
            reason_map.setdefault(r, []).append(float(v))

        def _median(vals: list[float]) -> float:
            if not vals:
                return 0.0
            s = sorted(vals)
            mid = len(s) // 2
            return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2.0

        by_reason = []
        for reason, vals in sorted(reason_map.items(), key=lambda x: -len(x[1]))[:5]:
            med = _median(vals)
            p_win = sum(1 for v in vals if v > 0) / max(len(vals), 1)
            by_reason.append({
                "reason": reason,
                "n": len(vals),
                "median": round(med, 4),
                "p_win": round(p_win, 4),
                "delta": round(med, 4),
                "verdict": "relax" if med > 0.15 and len(vals) >= 30 else "keep" if len(vals) >= 30 else "inconclusive",
            })

        table_rows = [
            {
                "id": r["id"],
                "time": r["blocked_at"],
                "symbol": r["symbol"],
                "pattern": None if pattern == "ALL" else pattern,
                "direction": r["direction"],
                "status": "blocked",
                "reason": r["reason"],
                "r1h": r.get("forward_1h"),
                "r4h": r.get("forward_4h"),
                "r24h": r.get("forward_24h"),
            }
            for r in blocked_rows[:limit]
        ]

        blocked_returns = [r.get("forward_24h") for r in blocked_rows if r.get("forward_24h") is not None]

        return CounterfactualReviewResponse(
            ok=True,
            data={
                "pattern": pattern,
                "horizon": 24,
                "since_days": min(days, 90),
                "traded": {"n": 0, "median": 0.0, "iqr": [0.0, 0.0], "p_win": 0.0, "histogram": [0] * 20},
                "blocked": {
                    "n": len(blocked_rows),
                    "median": round(_median([float(v) for v in blocked_returns]), 4),
                    "iqr": [0.0, 0.0],
                    "p_win": round(sum(1 for v in blocked_returns if float(v) > 0) / max(len(blocked_returns), 1), 4),
                    "histogram": [0] * 20,
                },
                "delta_median": 0.0,
                "ci_95": [0.0, 0.0],
                "welch": {"t": 0.0, "p": 1.0, "df": 0.0, "insufficient_data": True},
                "by_reason": by_reason,
                "table": table_rows,
                "outcomes_available": True,
            },
        )
    except Exception as exc:
        log.warning("counterfactual: query failed: %s", exc)
        return CounterfactualReviewResponse(ok=False, error=str(exc))


# ---------------------------------------------------------------------------
# GET /patterns/{slug}/filter-drag
# ---------------------------------------------------------------------------

class FilterDragResponse(BaseModel):
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


@router.get("/patterns/{slug}/filter-drag", response_model=FilterDragResponse, tags=["counterfactual"])
async def get_filter_drag(
    slug: str,
    threshold: float = Query(default=0.55, ge=0.0, le=1.0, description="Simulated p_win threshold (0-1)"),
    since: int = Query(default=90, description="Look-back in days"),
) -> FilterDragResponse:
    """Return simulated result if filter threshold changed.

    Read-only simulation — production thresholds are NOT mutated.
    The primary implementation lives in the SvelteKit API layer.
    """
    return FilterDragResponse(
        ok=True,
        data={
            "slug": slug,
            "since_days": since,
            "filters": [
                {
                    "key": "p_win_min",
                    "label": "p_win min",
                    "type": "number",
                    "range": [0.4, 0.7],
                    "current": 0.55,
                    "simulated": round(threshold, 3),
                    "pnl_delta_pct": 0.0,
                    "trade_count_delta": 0,
                },
            ],
            "preview": {
                "current": {"equity": [], "sharpe": 0.0},
                "simulated": {"equity": [], "sharpe": 0.0},
                "delta_pct": 0.0,
            },
            "outcomes_available": False,
        },
    )


# ---------------------------------------------------------------------------
# GET /patterns/{slug}/formula
# ---------------------------------------------------------------------------

class FormulaResponse(BaseModel):
    ok: bool
    data: dict[str, Any] | None = None
    error: str | None = None


REGIMES = ["bull", "neutral", "bear"]
PWIN_QUANTILES = ["0.55-0.60", "0.60-0.65", "0.65-0.70", "0.70+"]


def _empty_buckets() -> list[dict[str, Any]]:
    return [
        {"regime": r, "quantile": q, "n": 0, "pnl": 0.0}
        for r in REGIMES
        for q in PWIN_QUANTILES
    ]


@router.get("/patterns/{slug}/formula", response_model=FormulaResponse, tags=["counterfactual"])
async def get_pattern_formula(slug: str) -> FormulaResponse:
    """Return pattern formula with buckets/evidence/suspect rows.

    Read-only. The primary implementation lives in the SvelteKit API layer.
    Falls back to an empty payload when Supabase is unavailable.
    """
    if not _supabase_available():
        return FormulaResponse(
            ok=True,
            data={
                "slug": slug,
                "settings": {
                    "p_win_min": 0.55,
                    "tp_pct": 0.6,
                    "sl_pct": 0.3,
                    "cooldown_min": 60,
                    "regime_allow": ["bull", "neutral"],
                },
                "calibrated_at": None,
                "variables": [],
                "buckets": _empty_buckets(),
                "evidence": [],
                "suspects": [],
                "outcomes_available": False,
            },
        )

    try:
        from supabase import create_client  # type: ignore[import]

        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        sb = create_client(url, key)

        suspects_res = (
            sb.table("blocked_candidates")
            .select("id,symbol,reason,blocked_at,forward_24h")
            .not_.is_("forward_24h", "null")
            .gt("forward_24h", 1.0)
            .order("forward_24h", desc=True)
            .limit(5)
            .execute()
        )
        suspects_data = suspects_res.data or []

        def _weight(cf: float | None) -> str:
            if cf is None:
                return "low"
            return "high" if abs(cf) >= 2 else "med" if abs(cf) >= 1 else "low"

        suspects = [
            {
                "candidate_id": s["id"],
                "blocked_at": s["blocked_at"],
                "symbol": s["symbol"],
                "blocked_reason": s["reason"],
                "cf_24h": s.get("forward_24h"),
                "weight": _weight(s.get("forward_24h")),
            }
            for s in suspects_data
        ]

        return FormulaResponse(
            ok=True,
            data={
                "slug": slug,
                "settings": {
                    "p_win_min": 0.55,
                    "tp_pct": 0.6,
                    "sl_pct": 0.3,
                    "cooldown_min": 60,
                    "regime_allow": ["bull", "neutral"],
                },
                "calibrated_at": None,
                "variables": [],
                "buckets": _empty_buckets(),
                "evidence": [],
                "suspects": suspects,
                "outcomes_available": True,
            },
        )
    except Exception as exc:
        log.warning("formula: query failed: %s", exc)
        return FormulaResponse(ok=False, error=str(exc))
