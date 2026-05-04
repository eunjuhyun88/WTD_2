"""Admin endpoint: top slow queries from pg_stat_statements (W-0402 PR4).

Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.
Returns top 20 queries by mean execution time.
No auth guard — deploy behind Cloud Run IAM or add API key check before production.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException

log = logging.getLogger("engine.api.admin.db_stats")
router = APIRouter()


def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


@router.get("/admin/db-stats")
async def db_stats() -> dict[str, Any]:
    """Return top 20 queries by mean execution time from pg_stat_statements."""
    try:
        sb = _sb()
        res = sb.rpc("get_top_slow_queries", {"limit_n": 20}).execute()
        return {"ok": True, "queries": res.data or []}
    except Exception as exc:
        log.error("db_stats failed: %s", exc)
        raise HTTPException(status_code=500, detail="db_stats unavailable") from exc
