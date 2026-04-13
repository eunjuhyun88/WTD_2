"""Result Ledger types — records outcomes of PatternObject instances."""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Literal
import uuid

Outcome = Literal["success", "failure", "timeout", "pending"]

@dataclass
class PatternOutcome:
    """One instance of a pattern playing out."""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    pattern_slug: str = ""
    symbol: str = ""
    user_id: str | None = None

    # Timeline
    phase2_at: datetime | None = None        # REAL_DUMP detected
    accumulation_at: datetime | None = None  # ACCUMULATION entered (entry signal)
    breakout_at: datetime | None = None      # BREAKOUT detected (success)
    invalidated_at: datetime | None = None

    # Prices
    phase2_price: float | None = None
    entry_price: float | None = None         # price at ACCUMULATION entry
    peak_price: float | None = None          # highest after entry
    invalidation_price: float | None = None

    # Result
    outcome: Outcome = "pending"
    max_gain_pct: float | None = None        # (peak - entry) / entry
    duration_hours: float | None = None

    # Market context
    btc_trend_at_entry: str = "unknown"      # "bullish" | "bearish" | "sideways"

    # User feedback
    user_verdict: Literal["valid", "invalid", "missed"] | None = None
    user_note: str | None = None

    created_at: datetime = field(default_factory=lambda: datetime.now())
    updated_at: datetime = field(default_factory=lambda: datetime.now())

    def to_dict(self) -> dict:
        d = asdict(self)
        # Convert datetimes to ISO strings
        for k, v in d.items():
            if isinstance(v, datetime):
                d[k] = v.isoformat()
        return d


@dataclass
class PatternStats:
    """Aggregated stats for a pattern."""
    pattern_slug: str
    total_instances: int
    pending_count: int
    success_count: int
    failure_count: int
    success_rate: float             # success / (success + failure)
    avg_gain_pct: float | None      # avg of successful max_gain_pct
    avg_duration_hours: float | None
    recent_30d_count: int
    recent_30d_success_rate: float | None
