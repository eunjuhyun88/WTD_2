"""Pattern Engine types — PhaseCondition, PatternObject, SymbolPhaseState.

This is a HIGHER LEVEL abstraction than engine/challenge/ (feature vector matching).
PatternObject defines a pattern as an ordered sequence of Phase conditions,
where each Phase is defined by which building blocks must/must-not fire.

Relationship to ChallengeRecord:
  - ChallengeRecord: vector similarity matching (data-driven, bottom-up)
  - PatternObject: rule-based phase sequencing (interpretable, top-down)
  Both coexist. PatternObject is used by PatternStateMachine.

v2: Added feature_snapshot and confidence to PhaseTransition for reproducibility.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal
import uuid

@dataclass
class PhaseCondition:
    """Defines one Phase of a pattern."""
    phase_id: str                        # "REAL_DUMP", "ACCUMULATION", etc.
    label: str                           # human-readable
    required_blocks: list[str]           # ALL must fire
    optional_blocks: list[str] = field(default_factory=list)   # bonus confidence
    disqualifier_blocks: list[str] = field(default_factory=list)  # ANY disqualifies
    min_bars: int = 1                    # must persist this many bars before advancing
    max_bars: int = 48                   # timeout bars
    timeframe: str = "1h"

@dataclass
class PatternObject:
    """A trading pattern defined as an ordered Phase sequence."""
    slug: str
    name: str
    description: str
    phases: list[PhaseCondition]
    entry_phase: str                     # phase_id where alerts fire
    target_phase: str                    # phase_id = success condition
    timeframe: str = "1h"
    universe_scope: str = "binance_dynamic"
    tags: list[str] = field(default_factory=list)
    version: int = 1
    created_by: str = "system"

@dataclass
class SymbolPhaseState:
    """Tracks which phase a symbol is currently in."""
    symbol: str
    pattern_slug: str
    current_phase_idx: int = 0
    phase_entered_at: datetime | None = None
    bars_in_phase: int = 0
    phase_history: list[tuple[str, datetime]] = field(default_factory=list)
    invalidated: bool = False

@dataclass
class PhaseTransition:
    """Emitted when a symbol moves from one phase to another."""
    symbol: str
    pattern_slug: str
    from_phase: str
    to_phase: str
    timestamp: datetime
    reason: str = "condition_met"        # "condition_met" | "timeout"
    transition_kind: str = "advanced"    # "phase_entered" | "advanced" | "timeout_reset"
    is_entry_signal: bool = False        # True when entering entry_phase
    is_success: bool = False             # True when reaching target_phase
    # v2 additions
    confidence: float = 1.0              # 0-1, includes optional block bonus
    feature_snapshot: dict | None = None # 92-dim features at transition moment
    # v3: durable transition evidence
    transition_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    pattern_version: int = 1
    timeframe: str = "1h"
    from_phase_idx: int | None = None
    to_phase_idx: int | None = None
    trigger_bar_ts: datetime | None = None
    scan_id: str | None = None
    blocks_triggered: list[str] = field(default_factory=list)
    block_scores: dict | None = None
    data_quality: dict | None = None


@dataclass
class PatternStateRecord:
    """Durable current-state snapshot for one pattern/symbol/timeframe."""
    symbol: str
    pattern_slug: str
    pattern_version: int
    timeframe: str
    current_phase: str
    current_phase_idx: int
    entered_at: datetime | None = None
    bars_in_phase: int = 0
    last_eval_at: datetime | None = None
    last_transition_id: str | None = None
    active: bool = True
    invalidated: bool = False
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class PhaseTransitionRecord:
    """Append-only durable transition event."""
    transition_id: str
    symbol: str
    pattern_slug: str
    pattern_version: int
    timeframe: str
    from_phase: str | None
    to_phase: str
    from_phase_idx: int | None
    to_phase_idx: int
    transition_kind: str
    reason: str
    transitioned_at: datetime
    trigger_bar_ts: datetime | None
    scan_id: str | None
    confidence: float
    block_scores: dict
    blocks_triggered: list[str]
    feature_snapshot: dict | None = None
    data_quality: dict | None = None
    created_at: datetime = field(default_factory=datetime.now)
