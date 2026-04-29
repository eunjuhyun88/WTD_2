"""W-0321 — scheduler: daily decay + rescue trigger tests."""
from __future__ import annotations

import pytest

from personalization.affinity_registry import AffinityRegistry
from personalization.pattern_state_store import PatternStateStore
from personalization.scheduler import apply_daily_decay_all_users
from personalization.threshold_adapter import ThresholdAdapter
from personalization.types import BetaState, UserPatternState

_SLUG = "eth-head-shoulders"


def _build_state_with_history(
    user_id: str, n_valid: int = 5, n_invalid: int = 5
) -> UserPatternState:
    adapter = ThresholdAdapter({})
    state = ThresholdAdapter.initial_state(user_id, _SLUG)
    for _ in range(n_valid):
        state = adapter.update_on_verdict(state, "valid", "2025-10-01T00:00:00+00:00")
    for _ in range(n_invalid):
        state = adapter.update_on_verdict(state, "invalid", "2025-10-01T00:00:00+00:00")
    # Set decay_applied_at to 90 days before now
    return UserPatternState(
        user_id=state.user_id,
        pattern_slug=state.pattern_slug,
        states=state.states,
        n_total=state.n_total,
        last_verdict_at="2025-10-01T00:00:00+00:00",
        decay_applied_at="2025-10-01T00:00:00+00:00",
    )


def test_scheduler_decays_old_states(tmp_path):
    """States with decay_applied_at 90 days ago should have α reduced."""
    store = PatternStateStore(tmp_path / "states")
    affinity = AffinityRegistry(store_path=tmp_path / "affinity")

    state = _build_state_with_history("u1", n_valid=10, n_invalid=5)
    alpha_before = state.states["valid"].alpha
    store.put(state)

    result = apply_daily_decay_all_users(
        store, affinity, now_iso="2026-01-01T00:00:00+00:00"
    )

    assert result["users_processed"] == 1
    assert result["patterns_decayed"] == 1

    decayed = store.get("u1", _SLUG)
    assert decayed is not None
    # After ~92 days (≈ half-life), alpha should be reduced
    assert decayed.states["valid"].alpha < alpha_before


def test_scheduler_triggers_rescue_for_always_invalid(tmp_path):
    """30 invalid verdicts → valid_rate=0 → rescue triggered."""
    store = PatternStateStore(tmp_path / "states")
    audit_log = tmp_path / "audit.jsonl"
    affinity = AffinityRegistry(
        store_path=tmp_path / "affinity", audit_log_path=audit_log
    )

    # Build always-invalid state (n=30, valid=0)
    state = _build_state_with_history("rescue-user", n_valid=0, n_invalid=30)
    store.put(state)
    # Also register in affinity so reset has something to do
    for _ in range(30):
        affinity.update("rescue-user", _SLUG, "invalid")

    result = apply_daily_decay_all_users(
        store, affinity, now_iso="2026-01-01T00:00:00+00:00"
    )

    assert result["rescues_triggered"] == 1
    assert audit_log.exists()
    content = audit_log.read_text()
    assert "rescue-user" in content
    assert "auto_rescue" in content
