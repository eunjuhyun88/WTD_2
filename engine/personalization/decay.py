"""Concept drift decay for Beta posteriors (90-day half-life)."""
from __future__ import annotations

import math
from datetime import datetime, timezone

from personalization.types import BetaState, UserPatternState

HALF_LIFE_DAYS: float = 90.0


def apply_decay(
    state: UserPatternState,
    now_iso: str,
    half_life_days: float = HALF_LIFE_DAYS,
) -> UserPatternState:
    """Decay Beta posteriors by time since last verdict.

    Formula: effective_count(t) = effective_count_0 · 2^(−days/half_life)
    → α_eff = 1 + (α − 1) · decay_factor
    → β_eff = 1 + (β − 1) · decay_factor
    """
    if state.decay_applied_at is None:
        return state

    try:
        t0 = datetime.fromisoformat(state.decay_applied_at)
        t1 = datetime.fromisoformat(now_iso)
        if t0.tzinfo is None:
            t0 = t0.replace(tzinfo=timezone.utc)
        if t1.tzinfo is None:
            t1 = t1.replace(tzinfo=timezone.utc)
        days = max(0.0, (t1 - t0).total_seconds() / 86400)
    except (ValueError, TypeError):
        return state

    if days < 1.0:
        return state

    decay_factor = math.exp(-math.log(2) * days / half_life_days)

    new_states = {}
    for label, bs in state.states.items():
        new_alpha = 1.0 + (bs.alpha - 1.0) * decay_factor
        new_beta = 1.0 + (bs.beta - 1.0) * decay_factor
        new_states[label] = BetaState(alpha=max(1.0, new_alpha), beta=max(1.0, new_beta))

    return UserPatternState(
        user_id=state.user_id,
        pattern_slug=state.pattern_slug,
        states=new_states,
        n_total=state.n_total,
        last_verdict_at=state.last_verdict_at,
        decay_applied_at=now_iso,
    )
