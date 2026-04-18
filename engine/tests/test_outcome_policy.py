"""Unit tests for engine.patterns.outcome_policy.decide_outcome."""
from __future__ import annotations

from patterns.outcome_policy import (
    DEFAULT_POLICY,
    OutcomePolicy,
    decide_outcome,
)


def test_success_when_peak_clears_hit_threshold() -> None:
    # peak +20% vs entry → success
    decision = decide_outcome(
        entry_price=100.0,
        forward_closes=[105.0, 110.0, 120.0, 112.0],
    )
    assert decision is not None
    assert decision.outcome == "success"
    assert decision.peak_price == 120.0
    assert decision.exit_price == 112.0
    assert round(decision.max_gain_pct, 4) == 0.2
    assert round(decision.exit_return_pct, 4) == 0.12


def test_failure_when_exit_below_miss_threshold() -> None:
    # peak +2% (below HIT) but exit -15% (below MISS) → failure
    decision = decide_outcome(
        entry_price=100.0,
        forward_closes=[102.0, 95.0, 90.0, 85.0],
    )
    assert decision is not None
    assert decision.outcome == "failure"
    assert decision.exit_price == 85.0
    assert round(decision.max_gain_pct, 4) == 0.02
    assert round(decision.exit_return_pct, 4) == -0.15


def test_timeout_when_neither_threshold_hit() -> None:
    # peak +5%, exit -3% → in between → timeout
    decision = decide_outcome(
        entry_price=100.0,
        forward_closes=[105.0, 103.0, 97.0],
    )
    assert decision is not None
    assert decision.outcome == "timeout"


def test_hit_beats_miss_when_both_would_trigger() -> None:
    # peak +20% AND final exit -15% → success wins (peak check first)
    decision = decide_outcome(
        entry_price=100.0,
        forward_closes=[120.0, 110.0, 85.0],
    )
    assert decision is not None
    assert decision.outcome == "success"


def test_none_on_empty_forward_closes() -> None:
    assert decide_outcome(entry_price=100.0, forward_closes=[]) is None


def test_none_on_nonpositive_entry() -> None:
    assert decide_outcome(entry_price=0.0, forward_closes=[100.0]) is None
    assert decide_outcome(entry_price=-1.0, forward_closes=[100.0]) is None


def test_custom_policy_thresholds() -> None:
    # With tighter HIT threshold +5%, a +6% peak should promote to success.
    policy = OutcomePolicy(hit_threshold_pct=0.05, miss_threshold_pct=-0.05)
    decision = decide_outcome(
        entry_price=100.0,
        forward_closes=[106.0, 102.0],
        policy=policy,
    )
    assert decision is not None
    assert decision.outcome == "success"


def test_default_policy_thresholds_match_ledger_store() -> None:
    # Guard: keep resolver aligned with engine.ledger.store constants.
    assert DEFAULT_POLICY.hit_threshold_pct == 0.15
    assert DEFAULT_POLICY.miss_threshold_pct == -0.10
    assert DEFAULT_POLICY.evaluation_window_hours == 72.0
