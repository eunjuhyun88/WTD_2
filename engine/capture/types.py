"""Capture record types.

CaptureRecord is the canonical engine-side result of Save Setup. Pattern
candidate captures must reference a durable phase transition.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal
import uuid

CaptureKind = Literal[
    "pattern_candidate",
    "manual_hypothesis",
    "chart_bookmark",
    "post_trade_review",
]

CaptureStatus = Literal[
    "pending_outcome",
    "outcome_ready",
    "verdict_ready",
    "closed",
]


@dataclass(frozen=True)
class CaptureRecord:
    capture_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    capture_kind: CaptureKind = "pattern_candidate"
    user_id: str | None = None
    symbol: str = ""
    pattern_slug: str = ""
    pattern_version: int = 1
    phase: str = ""
    timeframe: str = "1h"
    captured_at_ms: int = 0
    candidate_transition_id: str | None = None
    candidate_id: str | None = None
    scan_id: str | None = None
    user_note: str | None = None
    chart_context: dict[str, Any] = field(default_factory=dict)
    research_context: dict[str, Any] | None = None
    feature_snapshot: dict[str, Any] | None = None
    block_scores: dict[str, Any] = field(default_factory=dict)
    verdict_id: str | None = None
    outcome_id: str | None = None
    status: CaptureStatus = "pending_outcome"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_supabase_dict(self) -> dict[str, Any]:
        """Return a dict shaped for the Supabase capture_records table (JSONB fields)."""
        return {
            "capture_id": self.capture_id,
            "capture_kind": self.capture_kind,
            "user_id": self.user_id or "auto",
            "symbol": self.symbol,
            "pattern_slug": self.pattern_slug,
            "pattern_version": self.pattern_version,
            "phase": self.phase,
            "timeframe": self.timeframe,
            "captured_at_ms": self.captured_at_ms,
            "candidate_transition_id": self.candidate_transition_id,
            "candidate_id": self.candidate_id,
            "scan_id": self.scan_id,
            "user_note": self.user_note,
            "chart_context_json": self.chart_context or {},
            "research_context_json": self.research_context,
            "feature_snapshot_json": self.feature_snapshot,
            "block_scores_json": self.block_scores or {},
            "verdict_id": self.verdict_id,
            "outcome_id": self.outcome_id,
            "status": self.status,
        }
