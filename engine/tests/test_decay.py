"""Tests for personalization.decay — 3 tests."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import pytest

from personalization.decay import apply_decay
from personalization.types import BetaState, UserPatternState


def test_decay_90d_halves_effective_n():
    """state with alpha=11 (1 prior + 10 verdicts), decay_applied_at=90d ago
    → after apply_decay, (new_alpha - 1) ≈ (10 × 0.5) = 5.0 (±1.0 margin)."""
    t90 = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    state = UserPatternState(
        user_id="u",
        pattern_slug="p",
        states={"valid": BetaState(alpha=11.0, beta=1.0)},
        n_total=10,
        last_verdict_at=None,
        decay_applied_at=t90,
    )
    now = datetime.now(timezone.utc).isoformat()
    decayed = apply_decay(state, now)
    new_alpha = decayed.states["valid"].alpha
    assert 4.9 <= (new_alpha - 1.0) <= 6.0, f"Expected effective_n ≈ 5.0, got {new_alpha - 1.0}"


def test_decay_zero_days_is_identity():
    """decay_applied_at=now → state unchanged (days < 1.0)."""
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    state = UserPatternState(
        user_id="u",
        pattern_slug="p",
        states={"valid": BetaState(alpha=5.0, beta=2.0)},
        n_total=4,
        last_verdict_at=None,
        decay_applied_at=now_iso,
    )
    result = apply_decay(state, now_iso)
    # Should be identity (days < 1.0)
    assert result.states["valid"].alpha == 5.0
    assert result.states["valid"].beta == 2.0


def test_decay_idempotent_after_apply():
    """apply twice with same now → same result."""
    t90 = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    state = UserPatternState(
        user_id="u",
        pattern_slug="p",
        states={"valid": BetaState(alpha=11.0, beta=1.0)},
        n_total=10,
        last_verdict_at=None,
        decay_applied_at=t90,
    )
    now = datetime.now(timezone.utc).isoformat()
    first = apply_decay(state, now)
    second = apply_decay(first, now)
    # After first decay, decay_applied_at=now; second call has days < 1.0 → identity
    assert second.states["valid"].alpha == first.states["valid"].alpha
    assert second.states["valid"].beta == first.states["valid"].beta
