"""Extreme event tracker jobs — wires research/event_tracker into the scheduler.

Two jobs:
  extreme_event_detector_job  — every 30 min: scan universe for funding_extreme /
                                OI_spike events and append to the JSONL log.
  extreme_event_outcome_job   — every 1 hour: fill 24/48/72h price outcomes for
                                pending events (uses offline kline cache).

Both default to off (EXTREME_EVENT_TRACKER_JOB=false). Set =true to enable.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

log = logging.getLogger("engine.scanner.jobs.extreme_event_tracker")


async def extreme_event_detector_job(
    universe_name: str = "binance_dynamic",
) -> None:
    """Scan universe for extreme events and append to event log."""
    try:
        from research.event_tracker.detector import ExtremeEventDetector
        from research.event_tracker.tracker import OutcomeTracker
        from universe.loader import load_universe_async

        universe = list(await load_universe_async(universe_name))
        if not universe:
            log.warning("extreme_event_detector: empty universe, skipping")
            return

        since = datetime.now(tz=timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        detector = ExtremeEventDetector(onset_only=True)
        events = detector.scan_universe(universe, since=since)

        if not events:
            log.debug("extreme_event_detector: no new events detected")
            return

        appended = OutcomeTracker().append_events(events)
        log.info(
            "extreme_event_detector: scanned %d symbols — detected=%d appended=%d",
            len(universe),
            len(events),
            appended,
        )

    except Exception as exc:
        log.warning("extreme_event_detector: failed (non-fatal) — %s", exc)


async def extreme_event_outcome_job() -> None:
    """Resolve 24/48/72h price outcomes for pending extreme events."""
    try:
        from research.event_tracker.tracker import OutcomeTracker

        updated = OutcomeTracker().update_outcomes()
        log.info("extreme_event_outcome: resolved %d event(s)", updated)

    except Exception as exc:
        log.warning("extreme_event_outcome: failed (non-fatal) — %s", exc)


__all__ = [
    "extreme_event_detector_job",
    "extreme_event_outcome_job",
]
