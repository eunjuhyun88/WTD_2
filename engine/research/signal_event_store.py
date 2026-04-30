"""W-0367: Supabase store for scan_signal_events + scan_signal_outcomes."""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

log = logging.getLogger("engine.research.signal_event_store")

SIGNAL_EVENTS_TABLE = "scan_signal_events"
SIGNAL_OUTCOMES_TABLE = "scan_signal_outcomes"
HORIZONS = [1, 4, 24, 72]


def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


def insert_signal_event(
    fired_at: datetime,
    symbol: str,
    pattern: str,
    direction: str,
    entry_price: float | None,
    component_scores: dict[str, Any],
    tp_pct: float = 0.60,
    sl_pct: float = 0.30,
) -> str:
    """Insert signal event. Returns signal_id (UUID str)."""
    fired_at_iso = fired_at.isoformat() if fired_at.tzinfo else fired_at.replace(tzinfo=timezone.utc).isoformat()
    row: dict[str, Any] = {
        "fired_at": fired_at_iso,
        "symbol": symbol,
        "pattern": pattern,
        "direction": direction,
        "tp_pct": tp_pct,
        "sl_pct": sl_pct,
        "component_scores": component_scores,
        "schema_version": component_scores.get("schema_version", 1),
    }
    if entry_price is not None:
        row["entry_price"] = entry_price

    sb = _sb()
    result = sb.table(SIGNAL_EVENTS_TABLE).insert(row).execute()
    data = result.data
    if not data:
        raise RuntimeError(f"insert_signal_event: no data returned for {symbol}/{pattern}")
    return str(data[0]["id"])


def init_outcomes(signal_id: str, fired_at: datetime) -> None:
    """Create 4 unresolved outcome rows (1h/4h/24h/72h) for a signal."""
    rows = [
        {
            "signal_id": signal_id,
            "horizon_h": h,
            "outcome_at": None,
            "realized_pnl_pct": None,
            "peak_pnl_pct": None,
            "triple_barrier_outcome": None,
            "outcome_error": None,
            "resolved_at": None,
        }
        for h in HORIZONS
    ]
    sb = _sb()
    sb.table(SIGNAL_OUTCOMES_TABLE).upsert(
        rows,
        on_conflict="signal_id,horizon_h",
    ).execute()


def fetch_unresolved(limit: int = 200) -> list[dict]:
    """Fetch unresolved outcomes (resolved_at IS NULL), with signal join.

    Returns list of dicts with merged signal + outcome fields.
    """
    sb = _sb()
    # Fetch unresolved outcome rows
    result = (
        sb.table(SIGNAL_OUTCOMES_TABLE)
        .select("*, scan_signal_events!inner(symbol, pattern, direction, entry_price, tp_pct, sl_pct, fired_at)")
        .is_("resolved_at", "null")
        .limit(limit)
        .execute()
    )
    rows = result.data or []
    # Flatten: merge signal fields into each outcome row
    merged = []
    for row in rows:
        event = row.pop("scan_signal_events", {}) or {}
        flat = {**row, **event}
        flat["signal_id"] = row["signal_id"]
        # Parse fired_at to datetime
        if isinstance(flat.get("fired_at"), str):
            try:
                flat["fired_at"] = datetime.fromisoformat(flat["fired_at"].replace("Z", "+00:00"))
            except Exception:
                pass
        merged.append(flat)
    return merged


def resolve_outcome(signal_id: str, horizon_h: int, outcome: dict[str, Any]) -> None:
    """Update one outcome row with resolved P&L and triple_barrier_outcome."""
    sb = _sb()
    sb.table(SIGNAL_OUTCOMES_TABLE).update(outcome).eq("signal_id", signal_id).eq("horizon_h", horizon_h).execute()


def fetch_signal_components(signal_id: str) -> dict | None:
    """Fetch component_scores for a single signal. Returns None if not found."""
    sb = _sb()
    result = (
        sb.table(SIGNAL_EVENTS_TABLE)
        .select("id, fired_at, symbol, pattern, direction, entry_price, component_scores, schema_version")
        .eq("id", signal_id)
        .limit(1)
        .execute()
    )
    data = result.data
    if not data:
        return None
    return data[0]


def fetch_resolved_outcomes(lookback_days: int, pattern_slug: str | None = None) -> list[dict]:
    """Fetch resolved outcomes within lookback window, optionally filtered by pattern.

    Returns list of dicts with merged signal fields (symbol, pattern, direction,
    entry_price, component_scores) and outcome fields (horizon_h, realized_pnl_pct,
    peak_pnl_pct, triple_barrier_outcome).
    """
    from datetime import datetime, timezone, timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()

    sb = _sb()
    query = (
        sb.table(SIGNAL_OUTCOMES_TABLE)
        .select(
            "horizon_h, realized_pnl_pct, peak_pnl_pct, triple_barrier_outcome, resolved_at, "
            "scan_signal_events!inner(symbol, pattern, direction, entry_price, component_scores, fired_at)"
        )
        .not_.is_("resolved_at", "null")
        .gte("resolved_at", cutoff)
    )

    result = query.execute()
    rows = result.data or []

    merged = []
    for row in rows:
        event = row.pop("scan_signal_events", {}) or {}
        flat = {**row, **event}
        if pattern_slug and flat.get("pattern") != pattern_slug:
            continue
        merged.append(flat)
    return merged
