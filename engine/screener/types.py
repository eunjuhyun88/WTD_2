"""Canonical Coin Screener runtime types."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

StructuralGrade = Literal["A", "B", "C", "excluded"]
TimingState = Literal["cold", "watch", "setup_forming", "accumulation_ready", "late"]
ConfidenceLevel = Literal["high", "medium", "low"]
ActionPriority = Literal["P0", "P1", "P2", "P3"]
ScreenerListingStatus = Literal["scored", "insufficient_data", "excluded", "stale"]
ScreenerRunStatus = Literal["pending", "completed", "failed"]
ScreenerRunMode = Literal["base", "overlay", "full"]


@dataclass(frozen=True)
class ScreenerListing:
    symbol: str
    run_id: str
    structural_score: float
    structural_grade: StructuralGrade
    timing_score: float
    timing_state: TimingState
    composite_sort_score: float
    confidence: ConfidenceLevel
    hard_filtered: bool = False
    status: ScreenerListingStatus = "scored"
    grade_flags: list[str] = field(default_factory=list)
    action_priority: ActionPriority = "P3"
    pattern_phase: str | None = None
    base_updated_at: str | None = None
    live_updated_at: str | None = None
    available_weight: float = 1.0
    missing_criteria: list[str] = field(default_factory=list)
    stale_criteria: list[str] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ScreenerRun:
    run_id: str
    mode: ScreenerRunMode
    status: ScreenerRunStatus
    started_at: str
    completed_at: str | None = None
    symbols_considered: int = 0
    symbols_scored: int = 0
    symbols_filtered_hard: int = 0
    grade_counts: dict[str, int] = field(default_factory=dict)
    used_fallback_universe: bool = False
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class ScreenerOverride:
    override_id: str
    scope: str
    target: str
    action: str
    reason: str
    author: str
    created_at: str
    expires_at: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
