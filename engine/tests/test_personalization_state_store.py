"""W-0321 — PatternStateStore: persistence + atomic write tests."""
from __future__ import annotations

import json
import threading

import pytest

from personalization.pattern_state_store import PatternStateStore
from personalization.threshold_adapter import ThresholdAdapter
from personalization.types import ALL_VERDICT_LABELS, BetaState, UserPatternState

_SLUG = "btc-double-bottom"


def _make_state(user_id: str = "u1", n: int = 15) -> UserPatternState:
    adapter = ThresholdAdapter({})
    state = ThresholdAdapter.initial_state(user_id, _SLUG)
    labels = (["valid"] * 9 + ["near_miss"] * 3 + ["invalid"] * 3) * (n // 15 + 1)
    for label in labels[:n]:
        state = adapter.update_on_verdict(state, label, "2026-04-30T00:00:00+00:00")
    return state


def test_put_and_get_roundtrip(tmp_path):
    store = PatternStateStore(tmp_path / "states")
    state = _make_state(n=20)
    store.put(state)
    loaded = store.get("u1", _SLUG)
    assert loaded is not None
    assert loaded.user_id == "u1"
    assert loaded.pattern_slug == _SLUG
    assert loaded.n_total == 20
    for label in ALL_VERDICT_LABELS:
        assert abs(loaded.states[label].alpha - state.states[label].alpha) < 1e-9
        assert abs(loaded.states[label].beta - state.states[label].beta) < 1e-9


def test_atomic_write_concurrent_puts(tmp_path):
    """Two threads writing same user must not produce corrupt JSON."""
    store = PatternStateStore(tmp_path / "states")
    errors = []

    def write(n: int) -> None:
        try:
            s = _make_state("u-concurrent", n)
            store.put(s)
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=write, args=(i * 5 + 10,)) for i in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"concurrent write errors: {errors}"
    # File must be valid JSON
    user_file = tmp_path / "states" / "u-concurrent.json"
    data = json.loads(user_file.read_text())
    assert _SLUG in data


def test_list_users_and_patterns(tmp_path):
    store = PatternStateStore(tmp_path / "states")
    for uid in ("alice", "bob"):
        for slug in ("pat-a", "pat-b"):
            s = _make_state(uid)
            s = UserPatternState(
                user_id=uid, pattern_slug=slug,
                states=s.states, n_total=s.n_total,
            )
            store.put(s)

    users = store.list_users()
    assert set(users) == {"alice", "bob"}
    assert set(store.list_patterns_for_user("alice")) == {"pat-a", "pat-b"}


def test_get_missing_returns_none(tmp_path):
    store = PatternStateStore(tmp_path / "states")
    assert store.get("nobody", "pat-x") is None
