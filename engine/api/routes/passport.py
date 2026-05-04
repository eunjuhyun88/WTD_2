"""GET /passport/{username} — Public passport stats endpoint (W-0391-E).

No auth required. Returns public accuracy stats for a given username.
If the user is not found or profile is private, returns 404.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException

log = logging.getLogger("engine.api.routes.passport")
router = APIRouter()


def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


_STREAK_THRESHOLDS = [1, 3, 7, 14, 30]
_STREAK_LABELS = {1: "1일 시작", 3: "3일 연속", 7: "7일 연속", 14: "2주 연속", 30: "30일 연속"}


def _next_streak_threshold(streak_days: int) -> int | None:
    """Return the next streak badge threshold, or None if all earned."""
    for t in _STREAK_THRESHOLDS:
        if streak_days < t:
            return t
    return None


def _compute_badges(accuracy: float, verdict_count: int, streak_days: int) -> list[str]:
    badges: list[str] = []
    # Streak badges (distinct-day, 5 tiers)
    for t in _STREAK_THRESHOLDS:
        if streak_days >= t:
            badges.append(_STREAK_LABELS[t])
    # Legacy badges
    if verdict_count >= 50:
        badges.append("첫 50 verdict")
    if accuracy >= 0.7:
        badges.append("정확도 70%+")
    return badges


@router.get("/passport/{username}")
async def get_public_passport(username: str) -> dict[str, Any]:
    """Return public passport stats for a user by username.

    Looks up user by username (display_name / nickname) from user_profiles.
    Returns 404 if not found or if the profile is set to private.
    """
    try:
        sb = _sb()

        # Look up the user_id from display name / username
        profile_res = (
            sb.table("user_profiles")
            .select("user_id, display_tier, passport_public")
            .eq("username", username)
            .limit(1)
            .execute()
        )

        if not profile_res.data:
            raise HTTPException(status_code=404, detail="User not found")

        profile = profile_res.data[0]

        # Respect privacy setting if present
        if profile.get("passport_public") is False:
            raise HTTPException(status_code=404, detail="Profile is private")

        user_id = profile["user_id"]

        # Fetch verdict accuracy stats
        accuracy_res = (
            sb.table("pattern_ledger_records")
            .select("user_verdict, outcome")
            .eq("user_id", user_id)
            .not_.is_("outcome", "null")
            .execute()
        )

        rows = accuracy_res.data or []
        verdict_count = len(rows)
        correct = 0
        for row in rows:
            verdict = row.get("user_verdict")
            outcome = row.get("outcome")
            if verdict == "valid" and outcome == "success":
                correct += 1
            elif verdict == "invalid" and outcome == "failure":
                correct += 1

        accuracy = (correct / verdict_count) if verdict_count > 0 else 0.0

        # Streak: consecutive distinct UTC days with ≥1 verdict (qualified)
        # Uses verdict_streak_history view (capture_records base, migration 058)
        streak_res = (
            sb.table("verdict_streak_history")
            .select("day_utc, verdict_count")
            .eq("user_id", user_id)
            .order("day_utc", desc=True)
            .limit(365)
            .execute()
        )

        streak_days = _compute_streak(streak_res.data or [])

        # Best pattern (pattern slug with highest win rate, min 3 verdicts)
        best_pattern = _compute_best_pattern(rows)

        badges = _compute_badges(accuracy, verdict_count, streak_days)
        next_threshold = _next_streak_threshold(streak_days)

        return {
            "username": username,
            "accuracy": round(accuracy, 4),
            "verdict_count": verdict_count,
            "streak_days": streak_days,
            "streak_next_threshold": next_threshold,
            "best_pattern": best_pattern,
            "badges": badges,
        }

    except HTTPException:
        raise
    except Exception as exc:
        log.error("passport lookup failed for %s: %s", username, exc)
        raise HTTPException(status_code=500, detail="Internal error") from exc


def _compute_streak(rows: list[dict]) -> int:
    """Count consecutive days from verdict_streak_history view (day_utc field)."""
    from datetime import datetime, timedelta, timezone

    if not rows:
        return 0

    seen_days: set[str] = set()
    for row in rows:
        day = row.get("day_utc") or row.get("created_at", "")[:10]
        if day:
            seen_days.add(str(day)[:10])

    if not seen_days:
        return 0

    today = datetime.now(tz=timezone.utc).date()
    streak = 0
    current = today
    while True:
        if current.isoformat() in seen_days:
            streak += 1
            current -= timedelta(days=1)
        else:
            break
    return streak


def _compute_best_pattern(rows: list[dict]) -> str | None:
    """Return the pattern slug with the highest win rate (min 3 verdicts)."""
    from collections import defaultdict

    pattern_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"wins": 0, "total": 0})

    for row in rows:
        slug = row.get("pattern_slug")
        if not slug:
            continue
        verdict = row.get("user_verdict")
        outcome = row.get("outcome")
        pattern_stats[slug]["total"] += 1
        if verdict == "valid" and outcome == "success":
            pattern_stats[slug]["wins"] += 1
        elif verdict == "invalid" and outcome == "failure":
            pattern_stats[slug]["wins"] += 1

    best_slug: str | None = None
    best_rate = -1.0

    for slug, stats in pattern_stats.items():
        if stats["total"] < 3:
            continue
        rate = stats["wins"] / stats["total"]
        if rate > best_rate:
            best_rate = rate
            best_slug = slug

    return best_slug
