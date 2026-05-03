"""W-0393: Author Reputation Index — matview refresh + query."""
from __future__ import annotations

import logging
import os

log = logging.getLogger("engine.integrations.tv.author_reputation")

_MIN_N_FOR_WIN_RATE = 5


def refresh_matview() -> bool:
    """REFRESH MATERIALIZED VIEW CONCURRENTLY author_reputation_index.

    Best-effort — returns False on failure without raising.
    """
    try:
        import psycopg2
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY author_reputation_index;")
        conn.close()
        log.debug("author_reputation_index refreshed")
        return True
    except Exception as e:
        log.warning("refresh_matview failed: %s", e)
        return False


def get_author_reputation(author_username: str) -> dict | None:
    """Query author_reputation_index for a username.

    Returns None if author not found.
    Returns dict with win_rate=None if n < MIN_N_FOR_WIN_RATE (insufficient data).
    """
    try:
        from supabase import create_client
        sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        rows = (
            sb.table("author_reputation_index")
            .select("*")
            .eq("author_username", author_username)
            .execute()
        ).data or []
        if not rows:
            return None
        r = rows[0]
        n = int(r.get("n_imported") or 0)
        insufficient = n < _MIN_N_FOR_WIN_RATE
        return {
            "author_username": author_username,
            "n_imported": n,
            "avg_alpha_score": r.get("avg_alpha_score"),
            "win_rate": None if insufficient else r.get("win_rate"),
            "avg_return": r.get("avg_return"),
            "last_import_at": r.get("last_import_at"),
            "median_alpha": r.get("median_alpha"),
            "note": f"Insufficient data (n={n}, need ≥ {_MIN_N_FOR_WIN_RATE})" if insufficient else None,
        }
    except Exception as e:
        log.warning("get_author_reputation failed: %s", e)
        return None
