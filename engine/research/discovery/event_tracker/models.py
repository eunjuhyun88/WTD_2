"""Data models for the event tracker."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal


EventType = Literal["funding_extreme", "oi_spike", "compression"]


@dataclass
class ExtremeEvent:
    """A detected extreme market event for one symbol.

    Lifecycle:
        1. Detected: is_predictive=None, outcome_*=None
        2. Partially resolved: some outcome_* filled in
        3. Fully resolved: all outcome_* filled, is_predictive set
    """

    # Identity
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    symbol: str = ""
    timeframe: str = "1h"
    event_type: EventType = "funding_extreme"

    # Detection
    detected_at: datetime | None = None
    trigger_value: float = 0.0   # e.g. funding_rate=-0.00338

    # Outcomes (filled 24/48/72h after detection)
    outcome_24h: float | None = None   # price change fraction e.g. 0.15 = +15%
    outcome_48h: float | None = None
    outcome_72h: float | None = None

    # Verdict (set after 72h outcome is available)
    is_predictive: bool | None = None  # True if outcome_72h >= min_return

    # Metadata
    notes: str = ""

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "event_type": self.event_type,
            "detected_at": self.detected_at.isoformat() if self.detected_at else None,
            "trigger_value": self.trigger_value,
            "outcome_24h": self.outcome_24h,
            "outcome_48h": self.outcome_48h,
            "outcome_72h": self.outcome_72h,
            "is_predictive": self.is_predictive,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ExtremeEvent":
        detected_at = None
        if d.get("detected_at"):
            detected_at = datetime.fromisoformat(d["detected_at"])
        return cls(
            event_id=d.get("event_id", str(uuid.uuid4())),
            symbol=d.get("symbol", ""),
            timeframe=d.get("timeframe", "1h"),
            event_type=d.get("event_type", "funding_extreme"),
            detected_at=detected_at,
            trigger_value=d.get("trigger_value", 0.0),
            outcome_24h=d.get("outcome_24h"),
            outcome_48h=d.get("outcome_48h"),
            outcome_72h=d.get("outcome_72h"),
            is_predictive=d.get("is_predictive"),
            notes=d.get("notes", ""),
        )
