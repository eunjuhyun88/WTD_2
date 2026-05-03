"""GET /scoring/active-model — Layer C model status for SearchLayerBadge UI.

Returns the current active Layer C model version and its eval metrics,
or {"status": "off"} if no model is trained and active yet.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

log = logging.getLogger("engine.api.routes.scoring_status")
router = APIRouter()


class ActiveModelResponse(BaseModel):
    status: str             # "off" | "shadow" | "active"
    version: Optional[str] = None
    training_size: Optional[int] = None
    ndcg_at_5: Optional[float] = None
    ci_lower: Optional[float] = None
    lgbm_weight: float = 0.0


@router.get("/scoring/active-model", response_model=ActiveModelResponse, tags=["scoring"])
def get_active_model() -> ActiveModelResponse:
    """Return the Layer C model status consumed by SearchLayerBadge."""
    lgbm_weight = float(os.environ.get("LGBM_CONTEXT_SCORE_WEIGHT", "0.0"))

    try:
        from scoring.registry import ModelRegistry
        registry = ModelRegistry()
        active = registry.get_active("search_layer_c")
        if active is None:
            return ActiveModelResponse(status="off", lgbm_weight=lgbm_weight)

        return ActiveModelResponse(
            status=active.status,  # "active" or "shadow"
            version=active.version,
            training_size=active.training_size,
            ndcg_at_5=active.ndcg_at_5,
            ci_lower=active.ci_lower,
            lgbm_weight=lgbm_weight,
        )
    except Exception:
        log.exception("get_active_model: failed")
        return ActiveModelResponse(status="off", lgbm_weight=lgbm_weight)
