"""W-0393: Idea Twin Tracker — idea_twin_links CRUD + outcome resolution."""
from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

log = logging.getLogger("engine.integrations.tv.idea_twin_store")


@dataclass
class IdeaTwinLink:
    import_id: str
    combo_id: str
    author_username: str
    author_display_name: str | None = None
    engine_alpha_score_at_import: float | None = None
    horizon_bars: int = 30


def create_twin_link(link: IdeaTwinLink) -> str | None:
    """Insert idea_twin_links row. Returns row id or None on failure."""
    try:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        result = sb.table("idea_twin_links").insert({
            "id": str(uuid.uuid4()),
            "import_id": link.import_id,
            "combo_id": link.combo_id,
            "author_username": link.author_username,
            "author_display_name": link.author_display_name,
            "engine_alpha_score_at_import": link.engine_alpha_score_at_import,
            "horizon_bars": link.horizon_bars,
        }).execute()
        return result.data[0]["id"] if result.data else None
    except Exception as e:
        log.warning("create_twin_link failed: %s", e)
        return None


def resolve_outcomes(lookback_days: int = 35) -> int:
    """Update actual_outcome for unresolved links older than horizon.

    Called by 30d cron. Returns number of rows updated.
    """
    try:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        cutoff = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()
        rows = (
            sb.table("idea_twin_links")
            .select("id, combo_id")
            .is_("actual_outcome", "null")
            .lt("imported_at", cutoff)
            .execute()
        ).data or []

        updated = 0
        for row in rows:
            outcome = _lookup_triple_barrier_outcome(sb, row["combo_id"])
            if outcome:
                sb.table("idea_twin_links").update({
                    "actual_outcome": outcome["result"],
                    "actual_outcome_pct": outcome.get("pct"),
                    "outcome_resolved_at": datetime.now(timezone.utc).isoformat(),
                }).eq("id", row["id"]).execute()
                updated += 1
        log.info("resolve_outcomes: updated %d links", updated)
        return updated
    except Exception as e:
        log.warning("resolve_outcomes failed: %s", e)
        return 0


def _lookup_triple_barrier_outcome(sb, combo_id: str) -> dict | None:
    try:
        rows = (
            sb.table("signal_event_store")
            .select("triple_barrier_outcome, pnl_pct")
            .eq("combo_id", combo_id)
            .not_.is_("triple_barrier_outcome", "null")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        ).data or []
        if rows:
            r = rows[0]
            return {"result": r.get("triple_barrier_outcome"), "pct": r.get("pnl_pct")}
    except Exception:
        pass
    return None
