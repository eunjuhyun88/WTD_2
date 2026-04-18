"""Outcome decision rules for pattern captures.

The outcome resolver (engine/scanner/jobs/outcome_resolver.py) calls
``decide_outcome`` once per pending capture after its evaluation window
has elapsed. This module keeps the decision rules cleanly separated from
the scheduler so the thresholds can evolve per-pattern without touching
the loop.

First implementation — ``entry_profitable_at_N``:

    peak_return_pct = (max(forward_closes) - entry_price) / entry_price
    exit_return_pct = (forward_closes.iloc[-1] - entry_price) / entry_price

    if peak_return_pct >= hit_threshold_pct    → success
    elif exit_return_pct <= miss_threshold_pct → failure
    else                                        → timeout

Defaults mirror ``engine/ledger/store.py`` (HIT=+15%, MISS=-10%, 72h
window) so the resolver writes LEDGER:outcome records consistent with
the existing auto_evaluate_pending pipeline.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Outcome = Literal["success", "failure", "timeout", "pending"]

DEFAULT_HIT_THRESHOLD_PCT = 0.15
DEFAULT_MISS_THRESHOLD_PCT = -0.10
DEFAULT_EVAL_WINDOW_HOURS = 72.0


@dataclass(frozen=True)
class OutcomePolicy:
    """Pattern-level decision thresholds for entry_profitable_at_N."""

    hit_threshold_pct: float = DEFAULT_HIT_THRESHOLD_PCT
    miss_threshold_pct: float = DEFAULT_MISS_THRESHOLD_PCT
    evaluation_window_hours: float = DEFAULT_EVAL_WINDOW_HOURS


@dataclass(frozen=True)
class OutcomeDecision:
    outcome: Outcome
    entry_price: float
    peak_price: float
    exit_price: float
    max_gain_pct: float
    exit_return_pct: float


DEFAULT_POLICY = OutcomePolicy()

# Pattern-specific overrides. tradoor-oi-reversal-v1 keeps defaults until
# we have post-hoc evidence to tune it.
_PATTERN_POLICIES: dict[str, OutcomePolicy] = {}


def policy_for(pattern_slug: str) -> OutcomePolicy:
    """Return the OutcomePolicy for a pattern slug (default when unregistered)."""
    return _PATTERN_POLICIES.get(pattern_slug, DEFAULT_POLICY)


def register_policy(pattern_slug: str, policy: OutcomePolicy) -> None:
    """Register a pattern-specific policy (used by tests and future tuning)."""
    _PATTERN_POLICIES[pattern_slug] = policy


def decide_outcome(
    *,
    entry_price: float,
    forward_closes: list[float],
    policy: OutcomePolicy = DEFAULT_POLICY,
) -> OutcomeDecision | None:
    """Apply entry_profitable_at_N to a forward close series.

    ``forward_closes`` must contain at least one bar inside the
    evaluation window (post-entry). Returns ``None`` when the series is
    empty or entry_price is non-positive — the resolver treats that as
    "data missing" rather than a timeout verdict.
    """
    if entry_price <= 0 or not forward_closes:
        return None

    peak = max(entry_price, max(forward_closes))
    exit_price = forward_closes[-1]
    max_gain_pct = (peak - entry_price) / entry_price
    exit_return_pct = (exit_price - entry_price) / entry_price

    if max_gain_pct >= policy.hit_threshold_pct:
        outcome: Outcome = "success"
    elif exit_return_pct <= policy.miss_threshold_pct:
        outcome = "failure"
    else:
        outcome = "timeout"

    return OutcomeDecision(
        outcome=outcome,
        entry_price=float(entry_price),
        peak_price=float(peak),
        exit_price=float(exit_price),
        max_gain_pct=float(max_gain_pct),
        exit_return_pct=float(exit_return_pct),
    )
