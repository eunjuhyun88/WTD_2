"""GET /extreme-events — recent extreme market events (W-0355).

Query params:
    since  — lookback window, e.g. "24h" (default), "48h", "72h"
    limit  — max results (default 20, max 100)
    kind   — filter by event kind: funding | oi | price | all (default all)

Returns:
    { items: List[ExtremeEventOut], generated_at: int }

Auth: public (no login required), same as /opportunity.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Query

from api.schemas_extreme_event import ExtremeEventOut, ExtremeEventsResponse

router = APIRouter()

# Map event_type (engine) → kind (API)
_KIND_MAP: dict[str, str] = {
    "funding_extreme": "funding",
    "oi_spike": "oi",
    "compression": "price",
}


def _parse_since(since: str) -> timedelta:
    """Parse a duration string like '24h', '48h', '72h' into a timedelta."""
    since = since.strip().lower()
    if since.endswith("h"):
        try:
            hours = int(since[:-1])
            return timedelta(hours=max(1, min(hours, 168)))  # cap at 7d
        except ValueError:
            pass
    # default 24h
    return timedelta(hours=24)


@router.get("", response_model=ExtremeEventsResponse)
@router.get("/", response_model=ExtremeEventsResponse, include_in_schema=False)
def get_extreme_events(
    since: str = Query(default="24h", description="Lookback window e.g. 24h, 48h, 72h"),
    limit: int = Query(default=20, ge=1, le=100),
    kind: str = Query(default="all", description="funding | oi | price | all"),
) -> ExtremeEventsResponse:
    """Return recent extreme events from the JSONL event log."""
    try:
        from research.event_tracker.tracker import OutcomeTracker

        tracker = OutcomeTracker()
        all_events = tracker.load_all()
    except Exception:
        return ExtremeEventsResponse(items=[], generated_at=int(time.time() * 1000))

    cutoff = datetime.now(tz=timezone.utc) - _parse_since(since)

    results: list[ExtremeEventOut] = []
    for ev in all_events:
        if ev.detected_at is None:
            continue
        detected = ev.detected_at
        if detected.tzinfo is None:
            detected = detected.replace(tzinfo=timezone.utc)
        if detected < cutoff:
            continue

        mapped_kind = _KIND_MAP.get(ev.event_type, ev.event_type)
        if kind != "all" and mapped_kind != kind:
            continue

        results.append(
            ExtremeEventOut(
                symbol=ev.symbol,
                kind=mapped_kind,
                magnitude=ev.trigger_value,
                detected_at=detected,
                outcome_24h=ev.outcome_24h,
                outcome_48h=ev.outcome_48h,
                outcome_72h=ev.outcome_72h,
                is_predictive=ev.is_predictive,
            )
        )

    # Sort by detected_at descending (newest first), then cap
    results.sort(key=lambda e: e.detected_at, reverse=True)
    results = results[:limit]

    return ExtremeEventsResponse(
        items=results,
        generated_at=int(time.time() * 1000),
    )
