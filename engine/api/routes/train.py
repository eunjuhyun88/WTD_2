"""POST /train — trade_log records → LightGBM retrain → model swap.

Called when enough feedback (≥20 records) accumulates. The frontend
sends { records: [{ snapshot, outcome }] } and gets back AUC + version.

Per-user models: pass user_id to get a personalised model.
Global fallback: no user_id → trains the shared model.

Hill Climbing hook: after LightGBM retraining, if AUC improves,
the updated feature importances automatically influence the next
challenge pattern refinement (via scoring.lightgbm_engine.feature_importance).
"""
from __future__ import annotations

import logging

import numpy as np
from fastapi import APIRouter, HTTPException

from api.schemas import TrainRequest, TrainResponse
from models.compat import normalize_signal_snapshot_payload
from models.signal import (
    CVDState,
    EMAAlignment,
    HTFStructure,
    Regime,
    SignalSnapshot,
)
from scoring.feature_matrix import snapshot_to_vector
from scoring.lightgbm_engine import get_engine, MIN_TRAIN_RECORDS

log = logging.getLogger("engine.train")
router = APIRouter()


def _dict_to_snapshot(d: dict) -> SignalSnapshot:
    """Re-hydrate a SignalSnapshot from its dict representation."""
    # Enums may arrive as strings.
    d = normalize_signal_snapshot_payload(d)
    if isinstance(d.get("ema_alignment"), str):
        d["ema_alignment"] = EMAAlignment(d["ema_alignment"])
    if isinstance(d.get("htf_structure"), str):
        d["htf_structure"] = HTFStructure(d["htf_structure"])
    if isinstance(d.get("cvd_state"), str):
        d["cvd_state"] = CVDState(d["cvd_state"])
    if isinstance(d.get("regime"), str):
        d["regime"] = Regime(d["regime"])
    return SignalSnapshot(**d)


@router.post("", response_model=TrainResponse)
async def train(req: TrainRequest) -> TrainResponse:
    """Retrain LightGBM on new trade records.

    Records with outcome == -1 (timeout / neutral) are excluded from
    training — only clear wins (1) and losses (0) are used.
    """
    if len(req.records) < MIN_TRAIN_RECORDS:
        raise HTTPException(
            status_code=400,
            detail=f"Need ≥{MIN_TRAIN_RECORDS} records (got {len(req.records)})",
        )

    # Build feature matrix + labels, dropping timeouts.
    X_parts: list[np.ndarray] = []
    y_parts: list[int] = []

    for rec in req.records:
        if rec.outcome not in (0, 1):
            continue  # skip timeouts
        try:
            snap = _dict_to_snapshot(rec.snapshot)
            vec = snapshot_to_vector(snap)
            X_parts.append(vec)
            y_parts.append(rec.outcome)
        except Exception as exc:
            log.warning("Skipping malformed record: %s", exc)

    if len(X_parts) < MIN_TRAIN_RECORDS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"After filtering timeouts/invalid, only {len(X_parts)} usable "
                f"records remain (need {MIN_TRAIN_RECORDS})"
            ),
        )

    X = np.stack(X_parts)
    y = np.array(y_parts, dtype=int)

    engine = get_engine(req.user_id)
    result = engine.train(X, y)

    # model_version: new version if replaced, "not_replaced" if incumbent kept.
    model_version = (
        result["model_version"]
        if result["replaced"] and result["model_version"]
        else ("not_replaced" if not result["replaced"] else "untrained")
    )

    return TrainResponse(
        auc=result["auc"],
        n_samples=result["n_samples"],
        model_version=model_version,
    )
