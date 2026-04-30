"""W-0348: Pattern Object Store — Supabase-backed CRUD for PatternObjects.

Usage:
    from patterns.store import PatternStore
    store = PatternStore()
    store.upsert(pattern_obj)
    row = store.get("tradoor-oi-reversal-v1")
    rows = store.list(phase="FAKE_DUMP", limit=50)
"""
from __future__ import annotations

import dataclasses
import logging
import os
from typing import Any

log = logging.getLogger(__name__)

TABLE = "pattern_objects"


def _client():
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
    return create_client(url, key)


def _serialize_phases(phases: list) -> list[dict]:
    """Convert list[PhaseCondition] to JSON-serializable list[dict]."""
    result = []
    for ph in phases:
        d = dataclasses.asdict(ph)
        result.append(d)
    return result


def _pattern_to_row(p) -> dict[str, Any]:
    """Convert PatternObject to DB row dict."""
    from patterns.types import PatternObject
    return {
        "slug": p.slug,
        "name": p.name,
        "description": p.description or "",
        "direction": p.direction,
        "timeframe": p.timeframe,
        "version": p.version,
        "entry_phase": p.entry_phase,
        "target_phase": p.target_phase,
        "phase_ids": [ph.phase_id for ph in p.phases],
        "tags": list(p.tags),
        "phases_json": _serialize_phases(p.phases),
        "universe_scope": p.universe_scope,
        "created_by": p.created_by,
    }


class PatternStore:
    """Supabase-backed store for PatternObjects. Thread-safe (connection-per-call)."""

    def upsert(self, pattern) -> str:
        """Insert or update a PatternObject. Returns slug."""
        row = _pattern_to_row(pattern)
        (
            _client()
            .table(TABLE)
            .upsert(row, on_conflict="slug")
            .execute()
        )
        log.debug("upserted pattern slug=%s", pattern.slug)
        return pattern.slug

    def get(self, slug: str) -> dict | None:
        """Fetch one pattern by slug. Returns raw dict or None."""
        resp = (
            _client()
            .table(TABLE)
            .select("*")
            .eq("slug", slug)
            .limit(1)
            .execute()
        )
        return resp.data[0] if resp.data else None

    def list(
        self,
        phase: str | None = None,
        tag: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """List patterns with optional phase/tag filter.

        phase: match if ANY(phase_ids) contains this value.
        tag:   match if ANY(tags) contains this value.
        """
        q = _client().table(TABLE).select("*").limit(min(limit, 200))
        if phase:
            q = q.contains("phase_ids", [phase])
        if tag:
            q = q.contains("tags", [tag])
        resp = q.execute()
        return resp.data or []

    def count(self) -> int:
        """Return total row count."""
        resp = _client().table(TABLE).select("id", count="exact").execute()
        return resp.count or 0
