"""Users API routes — H-07 (F-60 gate status) + H-08 (per-user verdict accuracy)."""
from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("engine.api.users")
router = APIRouter()

_F60_VERDICT_THRESHOLD = 200
_F60_ACCURACY_THRESHOLD = 0.55


def _require_self(user_id: str, request: Request) -> None:
    requesting_user = getattr(request.state, "user_id", None)
    if requesting_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if requesting_user != user_id:
        raise HTTPException(status_code=403, detail="Cannot view another user's data")


@router.get("/{user_id}/f60-status")
async def get_f60_status(user_id: str, request: Request) -> dict:
    """H-07: F-60 copy-signal gate status for a user.

    Returns verdicts remaining + current accuracy + pass/fail.
    Cached 5 min (same TTL as PatternStatsEngine).
    """
    _require_self(user_id, request)

    from stats.user_accuracy import compute_user_accuracy
    acc = compute_user_accuracy(user_id)

    return {
        "user_id": acc.user_id,
        "gate_passed": acc.gate_eligible,
        "verdict_count": acc.verdict_count,
        "resolved_count": acc.resolved_count,
        "accuracy": acc.accuracy,
        "remaining_to_threshold": acc.remaining_for_gate,
        "thresholds": {
            "min_resolved": _F60_VERDICT_THRESHOLD,
            "min_accuracy": _F60_ACCURACY_THRESHOLD,
        },
        "breakdown": acc.breakdown,
    }


@router.get("/{user_id}/verdict-accuracy")
async def get_verdict_accuracy(user_id: str, request: Request) -> dict:
    """H-08: per-user verdict accuracy detail. Alias of f60-status for compatibility."""
    _require_self(user_id, request)

    from stats.user_accuracy import compute_user_accuracy
    acc = compute_user_accuracy(user_id)

    return {
        "user_id": acc.user_id,
        "verdict_count": acc.verdict_count,
        "resolved_count": acc.resolved_count,
        "accuracy": acc.accuracy,
        "gate_eligible": acc.gate_eligible,
        "remaining_for_gate": acc.remaining_for_gate,
        "breakdown": acc.breakdown,
    }
