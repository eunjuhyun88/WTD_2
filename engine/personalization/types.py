"""Shared types for personalization module."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Mapping

VerdictLabel = Literal["valid", "invalid", "near_miss", "too_early", "too_late"]

ALL_VERDICT_LABELS: tuple[VerdictLabel, ...] = (
    "valid", "invalid", "near_miss", "too_early", "too_late"
)

# Beta distribution state per verdict label
@dataclass(frozen=True)
class BetaState:
    alpha: float  # prior + successes
    beta: float   # prior + failures


@dataclass(frozen=True)
class UserPatternState:
    user_id: str
    pattern_slug: str
    states: dict[str, BetaState]     # VerdictLabel → BetaState
    n_total: int
    last_verdict_at: str | None = None
    decay_applied_at: str | None = None


@dataclass(frozen=True)
class ThresholdDelta:
    stop_mul_delta: float       # positive = loosen stop, negative = tighten
    entry_strict_delta: float   # positive = stricter entry conditions
    target_mul_delta: float     # positive = higher target
    n_used: int                 # verdicts used in calculation
    shrinkage_factor: float     # n / N_SHRINK (max 1.0)
    clamped: bool               # True if delta was clamped to Δ_max
