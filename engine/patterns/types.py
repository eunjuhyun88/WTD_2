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
    is_entry_signal: bool = False        # True when entering entry_phase
    is_success: bool = False             # True when reaching target_phase
    # v2 additions
    confidence: float = 1.0              # 0-1, includes optional block bonus
    feature_snapshot: dict | None = None # 92-dim features at transition moment
