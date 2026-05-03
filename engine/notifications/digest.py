"""W-0401 P3: Daily digest payload generator.

Computes per-user streak/verdict summary dict.
Actual email sending is handled by the Supabase Edge Function digest-email.

Required env vars (for direct script use):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from typing import Any

_LAYER_C_THRESHOLD = 50


def _sb() -> Any:
    from supabase import create_client  # type: ignore[import-untyped]

    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def _compute_streak(day_strings: list[str]) -> int:
    """Count consecutive days ending at today (UTC) with at least one verdict."""
    if not day_strings:
        return 0
    day_set = set(day_strings)
    streak = 0
    cur = date.today()
    while True:
        if cur.isoformat() in day_set:
            streak += 1
            cur -= timedelta(days=1)
        else:
            break
    return streak


def generate_digest_payload(user_id: str, *, sb: Any | None = None) -> dict[str, Any]:
    """Return digest stats dict for *user_id*.

    Keys:
      yesterday_count  int   — verdicts on the calendar day before today (UTC)
      streak_days      int   — current consecutive-day streak
      total            int   — all-time verdict count
      remaining        int   — verdicts until Layer C threshold (50)

    Returns empty dict ``{}`` if the user has zero verdicts.
    """
    if sb is None:
        sb = _sb()

    yesterday = (datetime.now(tz=timezone.utc) - timedelta(days=1)).date().isoformat()

    # verdict_streak_history is a VIEW: columns user_id, day_utc, verdict_count
    streak_res = (
        sb.table("verdict_streak_history")
        .select("day_utc, verdict_count")
        .eq("user_id", user_id)
        .order("day_utc", desc=True)
        .limit(365)
        .execute()
    )
    rows: list[dict[str, Any]] = streak_res.data or []
    if not rows:
        return {}

    total = sum(r["verdict_count"] for r in rows)
    yesterday_count = next(
        (r["verdict_count"] for r in rows if r["day_utc"] == yesterday), 0
    )
    streak = _compute_streak([r["day_utc"] for r in rows])
    remaining = max(0, _LAYER_C_THRESHOLD - total)

    return {
        "yesterday_count": yesterday_count,
        "streak_days": streak,
        "total": total,
        "remaining": remaining,
    }
