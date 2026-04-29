"""Personalization REST endpoints.

Prefix: /personalization
Auth:   JWT user_id injected via request.state.user_id (same as metrics_user)

Endpoints:
  POST /personalization/verdict
  GET  /personalization/user/{user_id}/variant/{pattern_slug}
  GET  /personalization/user/{user_id}/affinity
  POST /personalization/user/{user_id}/rescue/{pattern_slug}
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from personalization.affinity_registry import AffinityRegistry
from personalization.coldstart import is_cold, needs_rescue
from personalization.exceptions import PatternNotFoundError, StateCorruptedError
from personalization.pattern_state_store import PatternStateStore
from personalization.threshold_adapter import ThresholdAdapter
from personalization.types import VerdictLabel

router = APIRouter()

# ── Module-level singletons (lifespan-scoped, read-only registries) ──────────
_ENGINE_ROOT = Path(__file__).parent.parent

PERSONALIZATION_DIR = _ENGINE_ROOT / "personalization_data"
_AFFINITY_DIR = PERSONALIZATION_DIR / "affinity"
_STATE_DIR = PERSONALIZATION_DIR / "states"
_AUDIT_LOG = PERSONALIZATION_DIR / "audit" / "personalization_rescue.jsonl"

_affinity_registry: AffinityRegistry = AffinityRegistry(
    store_path=_AFFINITY_DIR,
    audit_log_path=_AUDIT_LOG,
)
_state_store: PatternStateStore = PatternStateStore(store_path=_STATE_DIR)
_threshold_adapter: ThresholdAdapter = ThresholdAdapter(global_priors={})


# ── Request / Response models ─────────────────────────────────────────────────

class VerdictRequest(BaseModel):
    user_id: str
    pattern_slug: str
    verdict: VerdictLabel
    captured_at: str


class ThresholdDeltaOut(BaseModel):
    stop_mul_delta: float
    entry_strict_delta: float
    target_mul_delta: float
    n_used: int
    shrinkage_factor: float
    clamped: bool


class VerdictResponse(BaseModel):
    mode: str        # "personalized" | "cold_start"
    delta: Optional[ThresholdDeltaOut]
    affinity_score: float


class VariantOut(BaseModel):
    pattern_slug: str
    variant_slug: str
    timeframe: str
    mode: str
    delta: Optional[ThresholdDeltaOut]
    base_variant_slug: str
    resolved_at: str


class AffinityEntry(BaseModel):
    pattern_slug: str
    alpha_valid: float
    beta_valid: float
    n_total: int
    score: float
    is_cold: bool
    updated_at: str


class AffinityListResponse(BaseModel):
    user_id: str
    patterns: list[AffinityEntry]


class RescueResponse(BaseModel):
    rescued: bool
    new_score: float


# ── Auth helper ───────────────────────────────────────────────────────────────

def _require_self(user_id: str, request: Request) -> None:
    """Ensure JWT user == path user_id."""
    requesting_user = getattr(request.state, "user_id", None)
    if requesting_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if requesting_user != user_id:
        raise HTTPException(status_code=403, detail="Cannot access another user's data")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/verdict", response_model=VerdictResponse)
async def post_verdict(body: VerdictRequest, request: Request) -> VerdictResponse:
    """Record a verdict and return updated affinity score + threshold delta.

    Cold-start users (n < 10) get mode="cold_start" with delta=null.
    Warm users (n ≥ 10) get mode="personalized" with computed delta.
    """
    aff_state = _affinity_registry.update(
        body.user_id, body.pattern_slug, body.verdict
    )

    state = _state_store.get(body.user_id, body.pattern_slug) or \
            ThresholdAdapter.initial_state(body.user_id, body.pattern_slug)
    state = _threshold_adapter.update_on_verdict(state, body.verdict, body.captured_at)
    _state_store.put(state)

    delta_out: Optional[ThresholdDeltaOut] = None
    if not is_cold(state):
        td = _threshold_adapter.compute_delta(state, body.pattern_slug)
        delta_out = ThresholdDeltaOut(
            stop_mul_delta=td.stop_mul_delta,
            entry_strict_delta=td.entry_strict_delta,
            target_mul_delta=td.target_mul_delta,
            n_used=td.n_used,
            shrinkage_factor=td.shrinkage_factor,
            clamped=td.clamped,
        )

    return VerdictResponse(
        mode="personalized" if not is_cold(state) else "cold_start",
        delta=delta_out,
        affinity_score=aff_state.score,
    )


@router.get("/user/{user_id}/variant/{pattern_slug}", response_model=VariantOut)
async def get_variant(
    user_id: str, pattern_slug: str, request: Request
) -> VariantOut:
    """Resolve personalized (or global fallback) variant for user × pattern."""
    _require_self(user_id, request)

    state = _state_store.get(user_id, pattern_slug)
    cold = is_cold(state)
    delta_out: Optional[ThresholdDeltaOut] = None

    if not cold and state is not None:
        td = _threshold_adapter.compute_delta(state, pattern_slug)
        delta_out = ThresholdDeltaOut(
            stop_mul_delta=td.stop_mul_delta,
            entry_strict_delta=td.entry_strict_delta,
            target_mul_delta=td.target_mul_delta,
            n_used=td.n_used,
            shrinkage_factor=td.shrinkage_factor,
            clamped=td.clamped,
        )

    return VariantOut(
        pattern_slug=pattern_slug,
        variant_slug=f"{pattern_slug}__canonical",
        timeframe="1h",
        mode="global_fallback" if cold else "personalized",
        delta=delta_out,
        base_variant_slug=f"{pattern_slug}__canonical",
        resolved_at=_affinity_registry._load(user_id).get(
            pattern_slug, {}
        ).get("updated_at", ""),
    )


@router.get("/user/{user_id}/affinity", response_model=AffinityListResponse)
async def get_affinity(
    user_id: str,
    request: Request,
    top_k: int = Query(default=10, ge=1, le=100),
) -> AffinityListResponse:
    """Return top-k affinity scores for a user across all patterns."""
    _require_self(user_id, request)

    states = _affinity_registry.list_for_user(user_id, top_k=top_k)
    return AffinityListResponse(
        user_id=user_id,
        patterns=[
            AffinityEntry(
                pattern_slug=s.pattern_slug,
                alpha_valid=s.alpha_valid,
                beta_valid=s.beta_valid,
                n_total=s.n_total,
                score=s.score,
                is_cold=s.is_cold,
                updated_at=s.updated_at,
            )
            for s in states
        ],
    )


@router.post("/user/{user_id}/rescue/{pattern_slug}", response_model=RescueResponse)
async def post_rescue(
    user_id: str, pattern_slug: str, request: Request
) -> RescueResponse:
    """Manually trigger rescue for always-invalid patterns.

    Returns rescued=False if needs_rescue check fails (valid_rate > 5% or n < 30).
    """
    _require_self(user_id, request)

    state = _state_store.get(user_id, pattern_slug)
    if state is None:
        raise HTTPException(status_code=404, detail="pattern state not found")

    if not needs_rescue(state):
        return RescueResponse(
            rescued=False,
            new_score=_affinity_registry.get_score(user_id, pattern_slug),
        )

    new_aff = _affinity_registry.reset(
        user_id, pattern_slug, reason="manual_rescue"
    )
    _state_store.delete(user_id, pattern_slug)
    return RescueResponse(rescued=True, new_score=new_aff.score)
