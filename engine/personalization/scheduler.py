"""Personalization scheduler: daily decay + rescue trigger.

Separate from engine/research/refinement_trigger (global pattern search).
This operates on per-user Beta posteriors only.

Typical invocation: called from a nightly cron or Cloud Run scheduled job.
"""
from __future__ import annotations

from datetime import datetime, timezone

from personalization.affinity_registry import AffinityRegistry
from personalization.coldstart import needs_rescue
from personalization.decay import apply_decay
from personalization.pattern_state_store import PatternStateStore


def apply_daily_decay_all_users(
    state_store: PatternStateStore,
    affinity: AffinityRegistry,
    now_iso: str | None = None,
) -> dict[str, int]:
    """Apply concept-drift decay to all user-pattern states and trigger rescues.

    Args:
        state_store: PatternStateStore instance.
        affinity: AffinityRegistry instance (used for rescue reset).
        now_iso: ISO timestamp for decay anchor. Defaults to UTC now.

    Returns:
        {"users_processed": N, "patterns_decayed": N, "rescues_triggered": N}
    """
    if now_iso is None:
        now_iso = datetime.now(timezone.utc).isoformat()

    n_users = 0
    n_decayed = 0
    n_rescued = 0

    for uid in state_store.list_users():
        n_users += 1
        for slug in state_store.list_patterns_for_user(uid):
            state = state_store.get(uid, slug)
            if state is None:
                continue

            decayed = apply_decay(state, now_iso)
            if decayed is not state:
                state_store.put(decayed)
                n_decayed += 1

            if needs_rescue(decayed):
                affinity.reset(uid, slug, reason="auto_rescue:always_invalid")
                n_rescued += 1

    return {
        "users_processed": n_users,
        "patterns_decayed": n_decayed,
        "rescues_triggered": n_rescued,
    }
