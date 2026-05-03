"""OutcomeTracker — resolves 24/48/72h price outcomes for ExtremeEvents.

Reads events from the JSONL event log, fills in outcome_* fields using
cached kline data, and rewrites the log.

Event log format: one JSON object per line at EVENT_LOG_PATH.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from research.event_tracker.models import ExtremeEvent

log = logging.getLogger("engine.event_tracker.tracker")

# Canonical event log — append-only JSONL
EVENT_LOG_PATH = Path(__file__).resolve().parents[3] / "engine" / "data_cache" / "event_log" / "events.jsonl"


class OutcomeTracker:
    """Load, update, and persist ExtremeEvent outcomes.

    Usage::

        tracker = OutcomeTracker()
        tracker.append_events(new_events)   # add newly detected events
        tracker.update_outcomes()           # fill in 24/48/72h outcomes
        predictive = tracker.get_predictive_events(min_return=0.10)
    """

    def __init__(
        self,
        log_path: Path = EVENT_LOG_PATH,
        min_return: float = 0.10,
    ) -> None:
        self.log_path = log_path
        self.min_return = min_return

    # ── I/O ─────────────────────────────────────────────────────────────────

    def load_all(self) -> list[ExtremeEvent]:
        """Load all events from the JSONL log."""
        if not self.log_path.exists():
            return []
        events: list[ExtremeEvent] = []
        with self.log_path.open("r") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        events.append(ExtremeEvent.from_dict(json.loads(line)))
                    except Exception as exc:  # noqa: BLE001
                        log.warning("Skipping malformed event line: %s", exc)
        return events

    def save_all(self, events: list[ExtremeEvent]) -> None:
        """Overwrite the JSONL log with the given events."""
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("w") as f:
            for ev in events:
                f.write(json.dumps(ev.to_dict()) + "\n")

    def append_events(self, events: list[ExtremeEvent]) -> int:
        """Append new events to the log, deduplicating by event_id.

        Returns number of events actually appended (new ones).
        """
        existing = {ev.event_id for ev in self.load_all()}
        new_events = [ev for ev in events if ev.event_id not in existing]
        if not new_events:
            return 0
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a") as f:
            for ev in new_events:
                f.write(json.dumps(ev.to_dict()) + "\n")
        return len(new_events)

    # ── Outcome resolution ───────────────────────────────────────────────────

    def update_outcomes(self) -> int:
        """Fill in outcome_* for all events that have elapsed enough time.

        Uses offline kline cache. Updates events in-place and rewrites the log.
        Returns count of events updated.
        """
        from data_cache.loader import load_klines  # local import

        events = self.load_all()
        now = datetime.now(tz=timezone.utc)
        updated = 0

        for ev in events:
            if ev.detected_at is None:
                continue
            detected = ev.detected_at
            if detected.tzinfo is None:
                detected = detected.replace(tzinfo=timezone.utc)

            # Try to load klines for this symbol
            try:
                klines = load_klines(ev.symbol, ev.timeframe, offline=True)
            except Exception:  # noqa: BLE001
                continue

            close = klines["close"].astype(float)
            entry_price = self._price_at(close, detected)
            if entry_price is None:
                continue

            changed = False
            for hours, attr in [(24, "outcome_24h"), (48, "outcome_48h"), (72, "outcome_72h")]:
                if getattr(ev, attr) is not None:
                    continue  # already resolved
                target_ts = detected + timedelta(hours=hours)
                if now < target_ts:
                    continue  # not yet elapsed
                exit_price = self._price_at(close, target_ts)
                if exit_price is None:
                    continue
                pct_change = (exit_price - entry_price) / entry_price
                setattr(ev, attr, round(pct_change, 6))
                changed = True

            # Set is_predictive once 72h outcome is available
            if ev.outcome_72h is not None and ev.is_predictive is None:
                ev.is_predictive = ev.outcome_72h >= self.min_return
                changed = True

            if changed:
                updated += 1

        if updated:
            self.save_all(events)
        log.info("update_outcomes: resolved %d events", updated)
        return updated

    @staticmethod
    def _price_at(close: pd.Series, ts: datetime) -> float | None:
        """Return close price at or just before `ts`. Returns None if not found."""
        if close.empty:
            return None
        # Find the last bar at or before ts
        idx = close.index[close.index <= ts]
        if idx.empty:
            return None
        return float(close[idx[-1]])

    # ── Queries ──────────────────────────────────────────────────────────────

    def get_predictive_events(
        self,
        *,
        min_return: float | None = None,
        event_type: str | None = None,
    ) -> list[ExtremeEvent]:
        """Return fully resolved events where is_predictive=True.

        Args:
            min_return: Override the instance-level min_return for this query.
            event_type: Filter by event type (e.g. "funding_extreme").
        """
        threshold = min_return if min_return is not None else self.min_return
        events = self.load_all()
        result = []
        for ev in events:
            if ev.outcome_72h is None:
                continue
            if ev.outcome_72h < threshold:
                continue
            if event_type is not None and ev.event_type != event_type:
                continue
            result.append(ev)
        return result

    def recent_events(
        self,
        since: timedelta,
        limit: int = 20,
    ) -> list[ExtremeEvent]:
        """Return events detected within the last `since` window, newest first.

        Args:
            since: Lookback duration (e.g. timedelta(hours=24)).
            limit: Maximum number of events to return.
        """
        cutoff = datetime.now(tz=timezone.utc) - since
        result: list[ExtremeEvent] = []
        for ev in self.load_all():
            if ev.detected_at is None:
                continue
            detected = ev.detected_at
            if detected.tzinfo is None:
                detected = detected.replace(tzinfo=timezone.utc)
            if detected >= cutoff:
                result.append(ev)
        result.sort(key=lambda e: e.detected_at or datetime.min, reverse=True)
        return result[:limit]

    def get_pending_events(self) -> list[ExtremeEvent]:
        """Return events still awaiting outcome resolution."""
        return [ev for ev in self.load_all() if ev.outcome_72h is None]

    def summary(self) -> dict:
        """Return a summary dict for reporting."""
        events = self.load_all()
        resolved = [ev for ev in events if ev.outcome_72h is not None]
        predictive = [ev for ev in resolved if ev.is_predictive]
        avg_return = (
            sum(ev.outcome_72h for ev in resolved) / len(resolved)
            if resolved else 0.0
        )
        return {
            "total": len(events),
            "resolved": len(resolved),
            "predictive": len(predictive),
            "pending": len(events) - len(resolved),
            "avg_return_72h": round(avg_return, 4),
            "hit_rate": round(len(predictive) / len(resolved), 3) if resolved else 0.0,
        }
