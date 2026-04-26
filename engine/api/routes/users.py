"""Users API routes — H-08: per-user verdict accuracy."""
from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("engine.api.users")
router = APIRouter()


@router.get("/{user_id}/verdict-accuracy")
async def get_verdict_accuracy(user_id: str, request: Request) -> dict:
    """Return per-user verdict accuracy stats.

    Only the requesting user (or admin) may query their own accuracy.
    Powers the H-07 F-60 Gate eligibility check.
    """
    requesting_user = getattr(request.state, "user_id", None)
    if requesting_user != user_id:
        raise HTTPException(status_code=403, detail="Cannot view another user's accuracy")

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
