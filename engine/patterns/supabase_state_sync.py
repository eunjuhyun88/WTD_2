"""Supabase write-through sync for pattern runtime states.

Pattern states in SQLite (pattern_runtime.sqlite) are lost on Cloud Run
container restart. This module provides:

  push_state_async(state)       — fire-and-forget background write to Supabase
  push_transition_async(record) — fire-and-forget background write to Supabase
  hydrate_from_supabase(store)  — startup: pull all active states from Supabase
                                   and upsert into the local SQLite store

Write path (every scan tick):
  SQLite write (sync, fast) → Supabase upsert (async, background thread)

Read path (container startup only):
  Supabase SELECT active states → SQLite upsert (restores in-progress patterns)

Environment variables required (same as rest of engine):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from patterns.state_store import PatternStateStore
    from patterns.types import PatternStateRecord, PhaseTransitionRecord

log = logging.getLogger("engine.patterns.supabase_sync")


def _supabase_available() -> bool:
    return bool(
        os.environ.get("SUPABASE_URL", "").strip()
        and os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )


def _sb():
    from supabase import create_client  # type: ignore[import]
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _state_to_row(state: PatternStateRecord) -> dict:
    return {
        "symbol": state.symbol,
        "pattern_slug": state.pattern_slug,
        "pattern_version": state.pattern_version,
        "timeframe": state.timeframe,
        "current_phase": state.current_phase,
        "current_phase_idx": state.current_phase_idx,
        "entered_at": _iso(state.entered_at),
        "bars_in_phase": state.bars_in_phase,
        "last_eval_at": _iso(state.last_eval_at),
        "last_transition_id": state.last_transition_id,
        "active": state.active,
        "invalidated": state.invalidated,
        "updated_at": _iso(state.updated_at) or datetime.now(timezone.utc).isoformat(),
    }


def _transition_to_row(record: PhaseTransitionRecord) -> dict:
    return {
        "transition_id": record.transition_id,
        "symbol": record.symbol,
        "pattern_slug": record.pattern_slug,
        "pattern_version": record.pattern_version,
        "timeframe": record.timeframe,
        "from_phase": record.from_phase,
        "to_phase": record.to_phase,
        "from_phase_idx": record.from_phase_idx,
        "to_phase_idx": record.to_phase_idx,
        "transition_kind": record.transition_kind,
        "reason": record.reason,
        "transitioned_at": _iso(record.transitioned_at),
        "trigger_bar_ts": _iso(record.trigger_bar_ts),
        "scan_id": record.scan_id,
        "confidence": record.confidence,
        "block_scores": record.block_scores or {},
        "blocks_triggered": record.blocks_triggered or [],
        "feature_snapshot": record.feature_snapshot,
        "data_quality": record.data_quality,
        "created_at": _iso(record.created_at),
    }


def _push_state_bg(state: PatternStateRecord) -> None:
    try:
        _sb().table("pattern_states").upsert(_state_to_row(state)).execute()
    except Exception as exc:
        log.debug("Supabase pattern state push failed (non-fatal): %s", exc)


def _push_transition_bg(record: PhaseTransitionRecord) -> None:
    try:
        row = _transition_to_row(record)
        _sb().table("phase_transitions").upsert(row, on_conflict="transition_id").execute()
    except Exception as exc:
        log.debug("Supabase phase transition push failed (non-fatal): %s", exc)


def push_state_async(state: PatternStateRecord) -> None:
    """Fire-and-forget: push pattern state to Supabase in a background thread.

    Non-blocking. Failures are logged at DEBUG level and swallowed — the
    SQLite write is already durable for the current process lifetime.
    """
    if not _supabase_available():
        return
    threading.Thread(target=_push_state_bg, args=(state,), daemon=True).start()


def push_transition_async(record: PhaseTransitionRecord) -> None:
    """Fire-and-forget: push phase transition to Supabase in a background thread."""
    if not _supabase_available():
        return
    threading.Thread(target=_push_transition_bg, args=(record,), daemon=True).start()


async def hydrate_from_supabase(store: PatternStateStore) -> int:
    """Startup hydration: restore active pattern states from Supabase into SQLite.

    Called once during FastAPI lifespan startup. Pulls all rows where
    active=true from the Supabase pattern_states table and upserts them
    into the local SQLite store. This ensures that patterns which were
    mid-progression at the time of the last container restart are resumed
    correctly without re-triggering spurious entry alerts.

    Returns the number of states restored.
    """
    if not _supabase_available():
        log.info("Supabase not configured — skipping pattern state hydration (local dev mode)")
        return 0

    import asyncio

    def _fetch_states() -> list[dict]:
        try:
            result = (
                _sb()
                .table("pattern_states")
                .select("*")
                .eq("active", True)
                .execute()
            )
            return result.data or []
        except Exception as exc:
            log.warning("Pattern state hydration fetch failed: %s", exc)
            return []

    rows = await asyncio.to_thread(_fetch_states)
    if not rows:
        log.info("Pattern state hydration: no active states in Supabase")
        return 0

    def _parse_dt(v: str | None) -> datetime | None:
        if not v:
            return None
        try:
            return datetime.fromisoformat(v)
        except (ValueError, TypeError):
            return None

    from patterns.types import PatternStateRecord

    count = 0
    for row in rows:
        try:
            state = PatternStateRecord(
                symbol=row["symbol"],
                pattern_slug=row["pattern_slug"],
                pattern_version=int(row.get("pattern_version", 1)),
                timeframe=row["timeframe"],
                current_phase=row["current_phase"],
                current_phase_idx=int(row["current_phase_idx"]),
                entered_at=_parse_dt(row.get("entered_at")),
                bars_in_phase=int(row.get("bars_in_phase", 0)),
                last_eval_at=_parse_dt(row.get("last_eval_at")),
                last_transition_id=row.get("last_transition_id"),
                active=bool(row.get("active", True)),
                invalidated=bool(row.get("invalidated", False)),
                updated_at=_parse_dt(row.get("updated_at")) or datetime.now(timezone.utc),
            )
            store.upsert_state(state)
            count += 1
        except Exception as exc:
            log.warning(
                "Pattern state hydration: failed to restore %s/%s: %s",
                row.get("symbol"),
                row.get("pattern_slug"),
                exc,
            )

    log.info("Pattern state hydration complete: %d active states restored from Supabase", count)
    return count
