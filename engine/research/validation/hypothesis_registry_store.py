"""W-0317: Hypothesis registry backed by Supabase Postgres.

One row per validate_and_gate() call.
DSR n_trials  = COUNT WHERE family=? AND expires_at > now()
BH-FDR denom  = COUNT WHERE expires_at > now()
Nightly purge = DELETE WHERE expires_at < now()
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any


def _client():
    from supabase import create_client  # type: ignore[import]

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    return create_client(url, key)


class HypothesisRegistryStore:
    """Supabase-backed hypothesis registry. Thread-safe (connection-per-call)."""

    TABLE = "hypothesis_registry"
    EXPIRE_DAYS = 365

    def register(
        self,
        slug: str,
        family: str,
        overall_pass: bool,
        stage: str,
        gate_dict: dict[str, Any] | None = None,
        result_dict: dict[str, Any] | None = None,
    ) -> str:
        """Insert one row. Returns the UUID id."""
        now = datetime.now(timezone.utc)
        row = {
            "slug": slug,
            "family": family,
            "overall_pass": overall_pass,
            "stage": stage,
            "computed_at": now.isoformat(),
            "expires_at": (now + timedelta(days=self.EXPIRE_DAYS)).isoformat(),
            "gate_json": gate_dict,
            "result_json": result_dict,
        }
        resp = _client().table(self.TABLE).insert(row).execute()
        return resp.data[0]["id"]

    def get_n_trials(self, family: str) -> int:
        """Count active (non-expired) rows for this family. Used as DSR n_trials."""
        now = datetime.now(timezone.utc).isoformat()
        resp = (
            _client()
            .table(self.TABLE)
            .select("id", count="exact")
            .eq("family", family)
            .gt("expires_at", now)
            .execute()
        )
        return resp.count or 0

    def get_bh_denominator(self) -> int:
        """Count all active rows across families. Used as BH-FDR denominator."""
        now = datetime.now(timezone.utc).isoformat()
        resp = (
            _client()
            .table(self.TABLE)
            .select("id", count="exact")
            .gt("expires_at", now)
            .execute()
        )
        return resp.count or 0

    def purge_expired(self) -> int:
        """Delete expired rows. Call from nightly job. Returns deleted count."""
        now = datetime.now(timezone.utc).isoformat()
        resp = _client().table(self.TABLE).delete().lt("expires_at", now).execute()
        return len(resp.data) if resp.data else 0
