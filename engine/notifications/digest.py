"""W-0401 P3: Daily digest email sender.

Computes per-user streak/verdict summary and sends via Resend.
Called by the Supabase Edge Function digest-email (POST /functions/v1/digest-email).

Required env vars:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from api.routes.passport import _compute_streak, _next_streak_threshold

log = logging.getLogger("engine.notifications.digest")
router = APIRouter()

_RESEND_ENDPOINT = "https://api.resend.com/emails"
_FROM_EMAIL = "Cogotchi <digest@cogotchi.app>"


def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def _get_user_stats(sb: Any, user_id: str) -> dict[str, Any]:
    """Return digest stats for a single user."""
    from datetime import datetime, timedelta, timezone
    week_ago = (datetime.now(tz=timezone.utc) - timedelta(days=7)).isoformat()

    week_res = (
        sb.table("pattern_ledger_records")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .gte("created_at", week_ago)
        .execute()
    )
    total_res = (
        sb.table("pattern_ledger_records")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )
    streak_res = (
        sb.table("pattern_ledger_records")
        .select("created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(365)
        .execute()
    )
    streak = _compute_streak(streak_res.data or [])
    next_t = _next_streak_threshold(streak)
    return {
        "week_count": week_res.count or 0,
        "total_count": total_res.count or 0,
        "streak": streak,
        "days_to_next": (next_t - streak) if next_t else None,
    }


def _render_html(stats: dict, name: str) -> str:
    next_line = (
        f"<p>다음 streak 배지까지 <strong>{stats['days_to_next']}일</strong> 남았습니다!</p>"
        if stats["days_to_next"] is not None
        else "<p>모든 streak 배지를 달성했습니다! 🎉</p>"
    )
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#0a0a0b;color:#faf7eb;max-width:480px;margin:0 auto;padding:24px">
  <h1 style="font-size:18px;font-weight:700;margin-bottom:4px">안녕하세요, {name}!</h1>
  <p style="color:rgba(250,247,235,0.55);font-size:13px">오늘의 Cogotchi 요약입니다.</p>
  <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(249,216,194,0.08);border-radius:12px;padding:16px;margin:16px 0">
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <span style="color:rgba(250,247,235,0.55);font-size:12px">이번 주 verdict</span>
      <strong>{stats['week_count']}개</strong>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <span style="color:rgba(250,247,235,0.55);font-size:12px">연속 일수</span>
      <strong>🔥 {stats['streak']}일</strong>
    </div>
    <div style="display:flex;justify-content:space-between">
      <span style="color:rgba(250,247,235,0.55);font-size:12px">전체 누적</span>
      <strong>{stats['total_count']}개</strong>
    </div>
  </div>
  {next_line}
  <a href="https://cogotchi.app/patterns"
     style="display:block;background:linear-gradient(180deg,rgba(250,247,235,0.98),rgba(249,246,241,0.96));color:#0e0e12;text-align:center;padding:12px;border-radius:999px;text-decoration:none;font-weight:700;font-size:13px;margin:16px 0">
    패턴 검증하기 →
  </a>
  <p style="font-size:11px;color:rgba(250,247,235,0.25);text-align:center;margin-top:24px">
    <a href="https://cogotchi.app/settings" style="color:rgba(250,247,235,0.4)">알림 설정 변경</a>
  </p>
</body></html>"""


def _send_one(email: str, stats: dict, name: str) -> bool:
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        log.error("RESEND_API_KEY not set — digest skipped")
        return False
    try:
        resp = httpx.post(
            _RESEND_ENDPOINT,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "from": _FROM_EMAIL,
                "to": [email],
                "subject": f"Cogotchi 일일 요약 — 이번 주 {stats['week_count']}건 🔥",
                "html": _render_html(stats, name),
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        log.error("digest send failed for %s: %s", email, exc)
        return False


def run_daily_digest() -> dict[str, int]:
    """Fetch opted-in users and send digest. Returns {sent, total}."""
    sb = _sb()

    # Users who explicitly opted out
    optout_res = sb.table("digest_subscriptions").select("user_id").eq("opt_in", False).execute()
    opted_out = {r["user_id"] for r in (optout_res.data or [])}

    # All users with ≥1 verdict
    users_res = (
        sb.table("pattern_ledger_records")
        .select("user_id")
        .not_.is_("user_id", "null")
        .execute()
    )
    user_ids = {r["user_id"] for r in (users_res.data or [])} - opted_out
    log.info("digest: %d eligible users", len(user_ids))

    sent = 0
    for uid in user_ids:
        try:
            user = sb.auth.admin.get_user_by_id(uid)
            email = user.user.email if user and user.user else None
            if not email:
                continue
            profile_res = (
                sb.table("user_profiles")
                .select("username")
                .eq("user_id", uid)
                .limit(1)
                .execute()
            )
            name = (profile_res.data[0].get("username") or "트레이더") if profile_res.data else "트레이더"
            stats = _get_user_stats(sb, uid)
            if stats["total_count"] == 0:
                continue
            if _send_one(email, stats, name):
                sent += 1
        except Exception as exc:
            log.error("digest error for %s: %s", uid, exc)

    log.info("digest: %d/%d sent", sent, len(user_ids))
    return {"sent": sent, "total": len(user_ids)}


@router.post("/digest/run")
async def trigger_digest() -> dict[str, int]:
    """POST /digest/run — trigger daily digest (called by Supabase cron or scheduler)."""
    try:
        return run_daily_digest()
    except Exception as exc:
        log.error("digest run failed: %s", exc)
        raise HTTPException(status_code=500, detail="Digest failed") from exc


@router.post("/digest/opt-out/{user_id}")
async def opt_out_digest(user_id: str) -> dict[str, str]:
    """Mark user as opted-out of digest."""
    try:
        sb = _sb()
        sb.table("digest_subscriptions").upsert(
            {"user_id": user_id, "opt_in": False},
            on_conflict="user_id",
        ).execute()
        return {"status": "opted_out"}
    except Exception as exc:
        log.error("opt-out failed for %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Opt-out failed") from exc


@router.post("/digest/opt-in/{user_id}")
async def opt_in_digest(user_id: str) -> dict[str, str]:
    """Re-enable digest for a user who opted out."""
    try:
        sb = _sb()
        sb.table("digest_subscriptions").upsert(
            {"user_id": user_id, "opt_in": True},
            on_conflict="user_id",
        ).execute()
        return {"status": "opted_in"}
    except Exception as exc:
        log.error("opt-in failed for %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Opt-in failed") from exc
