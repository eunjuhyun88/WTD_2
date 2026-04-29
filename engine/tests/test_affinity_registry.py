"""Tests for personalization.affinity_registry — 5 tests."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from personalization.affinity_registry import AffinityRegistry
from personalization.coldstart import needs_rescue


def test_affinity_uninformed_prior_seven_three(tmp_path):
    """7 valid + 3 invalid → alpha=8, beta=4, score ≈ 8/12 ≈ 0.667 (±0.01)."""
    registry = AffinityRegistry(store_path=tmp_path / "affinity")
    user_id = "u1"
    pattern_slug = "test-pattern"

    for _ in range(7):
        registry.update(user_id, pattern_slug, "valid")
    for _ in range(3):
        registry.update(user_id, pattern_slug, "invalid")

    state = registry.get_state(user_id, pattern_slug)
    assert state is not None
    assert state.alpha_valid == 8.0   # 1 prior + 7 valid
    assert state.beta_valid == 4.0    # 1 prior + 3 invalid
    expected_score = 8.0 / 12.0
    assert abs(state.score - expected_score) <= 0.01, f"Expected ~{expected_score:.3f}, got {state.score}"


def test_affinity_informed_prior_with_pglobal_0_5(tmp_path):
    """Informed prior alpha=3.5, beta=3.5 then 7 valid + 3 invalid → score ≈ 0.618."""
    registry = AffinityRegistry(store_path=tmp_path / "affinity")
    user_id = "u2"
    pattern_slug = "test-pattern"

    # Manually set informed prior via JSON
    store_dir = tmp_path / "affinity"
    store_dir.mkdir(parents=True, exist_ok=True)
    now_str = datetime.now(timezone.utc).isoformat()
    data = {
        pattern_slug: {
            "alpha_valid": 3.5,
            "beta_valid": 3.5,
            "n_total": 0,
            "score": 0.5,
            "is_cold": True,
            "updated_at": now_str,
        }
    }
    (store_dir / f"{user_id}.json").write_text(json.dumps(data))

    for _ in range(7):
        registry.update(user_id, pattern_slug, "valid")
    for _ in range(3):
        registry.update(user_id, pattern_slug, "invalid")

    state = registry.get_state(user_id, pattern_slug)
    assert state is not None
    # alpha = 3.5 + 7 = 10.5, beta = 3.5 + 3 = 6.5, total = 17
    expected_score = 10.5 / 17.0
    assert abs(state.score - expected_score) <= 0.01, f"Expected ~{expected_score:.3f}, got {state.score}"


def test_affinity_score_floor_for_search_priority(tmp_path):
    """Cold user → get_score returns 0.5 (neutral)."""
    registry = AffinityRegistry(store_path=tmp_path / "affinity")
    score = registry.get_score("cold-user", "some-pattern")
    assert score == 0.5


def test_always_invalid_rescue_resets_to_priors(tmp_path):
    """30 invalid verdicts → reset() → alpha=1, beta=1, is_cold=True."""
    registry = AffinityRegistry(store_path=tmp_path / "affinity")
    user_id = "u3"
    pattern_slug = "test-pattern"

    for _ in range(30):
        registry.update(user_id, pattern_slug, "invalid")

    state = registry.get_state(user_id, pattern_slug)
    assert state is not None
    assert state.n_total == 30

    # Reset
    reset_state = registry.reset(user_id, pattern_slug, reason="always_invalid_rescue")
    assert reset_state.alpha_valid == 1.0
    assert reset_state.beta_valid == 1.0
    assert reset_state.is_cold is True
    assert reset_state.n_total == 0


def test_list_for_user_returns_top_k_sorted(tmp_path):
    """3 patterns with different scores → top_k=2 returns 2 highest sorted."""
    registry = AffinityRegistry(store_path=tmp_path / "affinity")
    user_id = "u4"

    # pattern-a: 9 valid, 1 invalid → high score
    for _ in range(9):
        registry.update(user_id, "pattern-a", "valid")
    registry.update(user_id, "pattern-a", "invalid")

    # pattern-b: 5 valid, 5 invalid → medium score
    for _ in range(5):
        registry.update(user_id, "pattern-b", "valid")
    for _ in range(5):
        registry.update(user_id, "pattern-b", "invalid")

    # pattern-c: 1 valid, 9 invalid → low score
    registry.update(user_id, "pattern-c", "valid")
    for _ in range(9):
        registry.update(user_id, "pattern-c", "invalid")

    results = registry.list_for_user(user_id, top_k=2)
    assert len(results) == 2
    # Sorted descending by score
    assert results[0].score >= results[1].score
    # Top result should be pattern-a
    assert results[0].pattern_slug == "pattern-a"
