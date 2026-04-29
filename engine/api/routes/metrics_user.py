"""Per-user metrics — D2 NSM WVPL endpoint.

Design: work/active/W-0305-d2-wvpl-nsm-instrumentation.md
Auth:   JWT subject must equal {user_id} path param (no cross-user reads).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Request

from ledger.store import LEDGER_RECORD_STORE
from observability.wvpl import compute_wvpl_for_user, kst_week_start

log = logging.getLogger("engine.api.metrics_user")
router = APIRouter()

_MAX_WEEKS = 52


def _require_self(user_id: str, request: Request) -> None:
    requesting_user = getattr(request.state, "user_id", None)
    if requesting_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if requesting_user != user_id:
        raise HTTPException(status_code=403, detail="Cannot view another user's data")


@router.get("/user/{user_id}/wvpl")
async def get_user_wvpl(
    user_id: str,
    request: Request,
    weeks: int = Query(default=4, ge=1, le=_MAX_WEEKS),
) -> dict:
    """Return rolling WVPL breakdowns for the last ``weeks`` KST weeks.

    Response shape:
        {
          "user_id": "...",
          "weeks": [
            {"week_start": "...", "loop_count": N, "capture_n": ..., "search_n": ..., "verdict_n": ...},
            ...  # most-recent first
          ]
        }
    """
    _require_self(user_id, request)

    now = datetime.now().astimezone()
    current_week = kst_week_start(now)

    breakdowns = []
    for offset in range(weeks):
        week_start = current_week - timedelta(days=7 * offset)
        result = compute_wvpl_for_user(
            user_id,
            week_start,
            record_store=LEDGER_RECORD_STORE,
        )
        breakdowns.append(result.to_dict())

    return {"user_id": user_id, "weeks": breakdowns}
