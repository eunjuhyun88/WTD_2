"""JSON-based ledger store. Simple, portable, no DB dependency.

Files stored in engine/ledger_data/{pattern_slug}/{outcome_id}.json
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal

from ledger.types import PatternOutcome, PatternStats, Outcome

log = logging.getLogger("engine.ledger")

LEDGER_DIR = Path(__file__).parent.parent / "ledger_data"


class LedgerStore:
    """Append-only JSON ledger for PatternOutcome records."""

    def __init__(self, base_dir: Path = LEDGER_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _dir(self, pattern_slug: str) -> Path:
        d = self.base_dir / pattern_slug
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _path(self, pattern_slug: str, outcome_id: str) -> Path:
        return self._dir(pattern_slug) / f"{outcome_id}.json"

    def save(self, outcome: PatternOutcome) -> Path:
        """Create or update a PatternOutcome record."""
        outcome.updated_at = datetime.now()
        path = self._path(outcome.pattern_slug, outcome.id)
        with open(path, "w") as f:
            json.dump(outcome.to_dict(), f, indent=2)
        return path

    def load(self, pattern_slug: str, outcome_id: str) -> PatternOutcome | None:
        path = self._path(pattern_slug, outcome_id)
        if not path.exists():
            return None
        with open(path) as f:
            d = json.load(f)
        # Convert ISO strings back to datetime
        for k in ("phase2_at", "accumulation_at", "breakout_at", "invalidated_at", "created_at", "updated_at"):
            if d.get(k):
                try:
                    d[k] = datetime.fromisoformat(d[k])
                except ValueError:
                    d[k] = None
        return PatternOutcome(**d)

    def list_all(self, pattern_slug: str) -> list[PatternOutcome]:
        d = self._dir(pattern_slug)
        results = []
        for p in d.glob("*.json"):
            outcome = self.load(pattern_slug, p.stem)
            if outcome:
                results.append(outcome)
        return sorted(results, key=lambda o: o.created_at or datetime.min, reverse=True)

    def list_pending(self, pattern_slug: str) -> list[PatternOutcome]:
        return [o for o in self.list_all(pattern_slug) if o.outcome == "pending"]

    def close_outcome(
        self,
        pattern_slug: str,
        outcome_id: str,
        result: Outcome,
        peak_price: float | None = None,
        breakout_at: datetime | None = None,
        invalidated_at: datetime | None = None,
    ) -> PatternOutcome | None:
        """Mark a pending outcome as success/failure/timeout."""
        outcome = self.load(pattern_slug, outcome_id)
        if not outcome:
            log.warning(f"Outcome {outcome_id} not found")
            return None
        outcome.outcome = result
        if peak_price is not None:
            outcome.peak_price = peak_price
            if outcome.entry_price and outcome.entry_price > 0:
                outcome.max_gain_pct = (peak_price - outcome.entry_price) / outcome.entry_price
        if breakout_at:
            outcome.breakout_at = breakout_at
            if outcome.accumulation_at:
                delta = breakout_at - outcome.accumulation_at
                outcome.duration_hours = delta.total_seconds() / 3600
        if invalidated_at:
            outcome.invalidated_at = invalidated_at
        self.save(outcome)
        return outcome

    def compute_stats(self, pattern_slug: str) -> PatternStats:
        """Compute aggregate stats for a pattern."""
        outcomes = self.list_all(pattern_slug)
        if not outcomes:
            return PatternStats(
                pattern_slug=pattern_slug,
                total_instances=0, pending_count=0,
                success_count=0, failure_count=0,
                success_rate=0.0, avg_gain_pct=None,
                avg_duration_hours=None,
                recent_30d_count=0, recent_30d_success_rate=None,
            )

        pending = [o for o in outcomes if o.outcome == "pending"]
        success = [o for o in outcomes if o.outcome == "success"]
        failure = [o for o in outcomes if o.outcome in ("failure", "timeout")]

        decided = len(success) + len(failure)
        success_rate = len(success) / decided if decided > 0 else 0.0

        gains = [o.max_gain_pct for o in success if o.max_gain_pct is not None]
        avg_gain = sum(gains) / len(gains) if gains else None

        durations = [o.duration_hours for o in success if o.duration_hours is not None]
        avg_dur = sum(durations) / len(durations) if durations else None

        cutoff = datetime.now() - timedelta(days=30)
        recent = [o for o in outcomes if o.created_at and o.created_at > cutoff]
        recent_success = [o for o in recent if o.outcome == "success"]
        recent_failure = [o for o in recent if o.outcome in ("failure", "timeout")]
        recent_decided = len(recent_success) + len(recent_failure)
        recent_rate = len(recent_success) / recent_decided if recent_decided > 0 else None

        return PatternStats(
            pattern_slug=pattern_slug,
            total_instances=len(outcomes),
            pending_count=len(pending),
            success_count=len(success),
            failure_count=len(failure),
            success_rate=success_rate,
            avg_gain_pct=avg_gain,
            avg_duration_hours=avg_dur,
            recent_30d_count=len(recent),
            recent_30d_success_rate=recent_rate,
        )
