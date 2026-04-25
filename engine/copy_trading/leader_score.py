"""JUDGE score computation and trader_profiles sync.

Aggregates pattern_ledger_records outcomes (success/failure) per user to produce
an ELO-style score, then upserts into trader_profiles.

Score formula:
  base = win_count * 10 - loss_count * 6
  bonus = win_rate * 5  (0–5 bonus for high win-rate traders)
  judge_score = max(0, base + bonus)

This intentionally penalises losses more than timeout/pending non-events.
Only 'success' and 'failure' outcomes count — 'timeout' and 'pending' are excluded.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

log = logging.getLogger("engine.copy_trading.leader_score")


@dataclass
class UserOutcomeSummary:
    user_id: str
    win_count: int
    loss_count: int
    judge_score: float


def compute_judge_score(win_count: int, loss_count: int) -> float:
    """Compute JUDGE score from win/loss counts.

    Returns a non-negative float. Losses penalised at 0.6× win weight.
    A small win-rate bonus (max 5 pts) rewards consistency.
    """
    total = win_count + loss_count
    win_rate = win_count / total if total > 0 else 0.0
    base = win_count * 10 - loss_count * 6
    bonus = win_rate * 5
    return max(0.0, base + bonus)


def _sb() -> Any:
    from supabase import create_client  # type: ignore
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def fetch_outcome_summary(user_id: str) -> UserOutcomeSummary:
    """Fetch win/loss counts from pattern_ledger_records for a single user.

    Counts records where record_type='outcome' and outcome in payload is
    'success' (win) or 'failure' (loss). Pending/timeout outcomes are ignored.
    """
    sb = _sb()
    rows = (
        sb.table("pattern_ledger_records")
        .select("payload")
        .eq("user_id", user_id)
        .eq("record_type", "outcome")
        .execute()
        .data
    )
    win_count = 0
    loss_count = 0
    for row in rows:
        outcome = (row.get("payload") or {}).get("outcome", "")
        if outcome == "success":
            win_count += 1
        elif outcome == "failure":
            loss_count += 1

    score = compute_judge_score(win_count, loss_count)
    return UserOutcomeSummary(
        user_id=user_id,
        win_count=win_count,
        loss_count=loss_count,
        judge_score=score,
    )


def sync_trader_profile(user_id: str, display_name: str) -> UserOutcomeSummary:
    """Compute JUDGE score and upsert into trader_profiles.

    Safe to call repeatedly — idempotent upsert on user_id.
    """
    summary = fetch_outcome_summary(user_id)
    sb = _sb()
    sb.table("trader_profiles").upsert(
        {
            "user_id": user_id,
            "display_name": display_name,
            "judge_score": summary.judge_score,
            "win_count": summary.win_count,
            "loss_count": summary.loss_count,
            "updated_at": "now()",
        },
        on_conflict="user_id",
    ).execute()
    log.info(
        "synced trader_profile user=%s score=%.1f wins=%d losses=%d",
        user_id,
        summary.judge_score,
        summary.win_count,
        summary.loss_count,
    )
    return summary
