"""Leaderboard queries — top-N traders by JUDGE score."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

log = logging.getLogger("engine.copy_trading.leaderboard")


@dataclass
class TraderProfile:
    user_id: str
    display_name: str
    judge_score: float
    win_count: int
    loss_count: int


def _sb() -> Any:
    from supabase import create_client  # type: ignore
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def get_top_traders(limit: int = 20) -> list[TraderProfile]:
    """Return top-N traders sorted by judge_score descending.

    Returns an empty list when trader_profiles is empty — callers should
    handle the empty state gracefully (no exception thrown).
    """
    sb = _sb()
    rows = (
        sb.table("trader_profiles")
        .select("user_id, display_name, judge_score, win_count, loss_count")
        .order("judge_score", desc=True)
        .limit(limit)
        .execute()
        .data
    )
    return [
        TraderProfile(
            user_id=r["user_id"],
            display_name=r["display_name"],
            judge_score=float(r["judge_score"]),
            win_count=int(r["win_count"]),
            loss_count=int(r["loss_count"]),
        )
        for r in rows
    ]
