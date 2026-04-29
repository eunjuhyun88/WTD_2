"""Tests for personalization.threshold_adapter — 7 tests."""
from __future__ import annotations

import pytest

from personalization.types import BetaState, UserPatternState
from personalization.threshold_adapter import ThresholdAdapter

_GLOBAL_PRIORS = {
    "test-pattern": {
        "near_miss": 0.2,
        "valid": 0.5,
        "invalid": 0.15,
        "too_early": 0.1,
        "too_late": 0.05,
    }
}


def _make_state(
    user_id: str,
    pattern_slug: str,
    near_miss: int = 0,
    valid_: int = 0,
    invalid: int = 0,
    too_early: int = 0,
    too_late: int = 0,
) -> UserPatternState:
    n = near_miss + valid_ + invalid + too_early + too_late
    states = {
        "near_miss": BetaState(alpha=1.0 + near_miss, beta=1.0),
        "valid": BetaState(alpha=1.0 + valid_, beta=1.0),
        "invalid": BetaState(alpha=1.0 + invalid, beta=1.0),
        "too_early": BetaState(alpha=1.0 + too_early, beta=1.0),
        "too_late": BetaState(alpha=1.0 + too_late, beta=1.0),
    }
    return UserPatternState(
        user_id=user_id,
        pattern_slug=pattern_slug,
        states=states,
        n_total=n,
    )


def test_threshold_delta_near_miss_dominant():
    """7 near_miss + 3 valid → stop_mul_delta > 0 (loosen stop)."""
    adapter = ThresholdAdapter(global_priors=_GLOBAL_PRIORS)
    state = _make_state("u1", "test-pattern", near_miss=7, valid_=3)
    delta = adapter.compute_delta(state, "test-pattern")
    assert delta.stop_mul_delta > 0, f"Expected positive stop_mul_delta, got {delta.stop_mul_delta}"


def test_threshold_delta_clamped_at_delta_max():
    """Extreme near_miss (30/30) → clamped=True, abs(stop_mul_delta) <= 0.3."""
    adapter = ThresholdAdapter(global_priors=_GLOBAL_PRIORS)
    state = _make_state("u1", "test-pattern", near_miss=30)
    delta = adapter.compute_delta(state, "test-pattern")
    assert delta.clamped is True
    assert abs(delta.stop_mul_delta) <= 0.3


def test_threshold_delta_invalid_dominant_tightens_stop():
    """7 invalid + 3 valid → stop_mul_delta < 0 (tighten stop)."""
    adapter = ThresholdAdapter(global_priors=_GLOBAL_PRIORS)
    state = _make_state("u1", "test-pattern", invalid=7, valid_=3)
    delta = adapter.compute_delta(state, "test-pattern")
    assert delta.stop_mul_delta < 0, f"Expected negative stop_mul_delta, got {delta.stop_mul_delta}"


def test_threshold_delta_too_early_increases_strictness():
    """7 too_early → entry_strict_delta > 0."""
    adapter = ThresholdAdapter(global_priors=_GLOBAL_PRIORS)
    state = _make_state("u1", "test-pattern", too_early=7)
    delta = adapter.compute_delta(state, "test-pattern")
    assert delta.entry_strict_delta > 0, f"Expected positive entry_strict_delta, got {delta.entry_strict_delta}"


def test_update_on_verdict_increments_alpha_only_for_match():
    """update 'valid' → states['valid'].alpha increases by 1."""
    adapter = ThresholdAdapter(global_priors=_GLOBAL_PRIORS)
    state = _make_state("u1", "test-pattern", valid_=3)
    before_alpha = state.states["valid"].alpha

    updated = adapter.update_on_verdict(state, "valid", "2026-01-01T00:00:00Z")
    after_alpha = updated.states["valid"].alpha

    assert after_alpha == before_alpha + 1.0


def test_update_on_verdict_increments_beta_for_other_labels():
    """update 'valid' → states['invalid'].beta increases by 1."""
    adapter = ThresholdAdapter(global_priors=_GLOBAL_PRIORS)
    state = _make_state("u1", "test-pattern", valid_=3, invalid=2)
    before_beta = state.states["invalid"].beta

    updated = adapter.update_on_verdict(state, "valid", "2026-01-01T00:00:00Z")
    after_beta = updated.states["invalid"].beta

    assert after_beta == before_beta + 1.0


def test_shrinkage_factor_at_n30_equals_0_6():
    """n=18 → shrinkage_factor ≈ 18/30 = 0.6 (±0.01)."""
    adapter = ThresholdAdapter(global_priors=_GLOBAL_PRIORS)
    state = _make_state("u1", "test-pattern", near_miss=6, valid_=6, invalid=6)
    # n_total = 18
    assert state.n_total == 18
    delta = adapter.compute_delta(state, "test-pattern")
    assert abs(delta.shrinkage_factor - 0.6) <= 0.01, f"Expected ~0.6, got {delta.shrinkage_factor}"
