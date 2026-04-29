"""Tests for personalization.user_variant_registry — 4 tests."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from patterns.active_variant_registry import ActivePatternVariantEntry
from personalization.affinity_registry import AffinityRegistry
from personalization.threshold_adapter import ThresholdAdapter
from personalization.types import BetaState, UserPatternState
from personalization.user_variant_registry import UserVariantRegistry


_GLOBAL_PRIORS = {"test-pattern": {"near_miss": 0.2, "valid": 0.5, "invalid": 0.15, "too_early": 0.1, "too_late": 0.05}}


class MockVariantStore:
    def get(self, slug: str) -> ActivePatternVariantEntry:
        return ActivePatternVariantEntry(
            pattern_slug=slug,
            variant_slug=f"{slug}__v1",
            timeframe="1h",
            watch_phases=["ACCUMULATION"],
        )


def _make_registry(tmp_path: Path) -> UserVariantRegistry:
    affinity = AffinityRegistry(tmp_path / "affinity")
    adapter = ThresholdAdapter(_GLOBAL_PRIORS)
    reg = UserVariantRegistry(adapter, affinity, tmp_path / "variants")
    # Patch the store with mock
    reg._store = MockVariantStore()
    return reg


def _make_warm_state(user_id: str, pattern_slug: str, n: int = 15) -> UserPatternState:
    """Build a UserPatternState with n_total >= COLD_START_THRESHOLD."""
    per_label = n // 5
    remainder = n - per_label * 5
    states = {
        "near_miss": BetaState(alpha=1.0 + per_label, beta=1.0),
        "valid": BetaState(alpha=1.0 + per_label + remainder, beta=1.0),
        "invalid": BetaState(alpha=1.0 + per_label, beta=1.0),
        "too_early": BetaState(alpha=1.0 + per_label, beta=1.0),
        "too_late": BetaState(alpha=1.0 + per_label, beta=1.0),
    }
    return UserPatternState(
        user_id=user_id,
        pattern_slug=pattern_slug,
        states=states,
        n_total=n,
    )


def test_resolve_returns_global_when_cold(tmp_path):
    """n_total=5 in affinity → mode=='global_fallback'."""
    reg = _make_registry(tmp_path)
    user_id = "u-cold"
    pattern_slug = "test-pattern"

    # Add only 5 verdicts to affinity (below threshold=10)
    for _ in range(5):
        reg._affinity.update(user_id, pattern_slug, "valid")

    result = reg.resolve_for_user(user_id, pattern_slug)
    assert result.mode == "global_fallback"
    assert result.pattern_slug == pattern_slug


def test_resolve_applies_threshold_delta_when_warm(tmp_path):
    """n_total=15 in affinity, state provided → mode=='personalized', delta is not None."""
    reg = _make_registry(tmp_path)
    user_id = "u-warm"
    pattern_slug = "test-pattern"

    # Add 15 verdicts to affinity (above threshold=10)
    for _ in range(15):
        reg._affinity.update(user_id, pattern_slug, "valid")

    state = _make_warm_state(user_id, pattern_slug, n=15)
    result = reg.resolve_for_user(user_id, pattern_slug, state=state)
    assert result.mode == "personalized"
    assert result.delta is not None


def test_resolve_preserves_invariant_pattern_slug_timeframe(tmp_path):
    """resolved.pattern_slug == input pattern_slug."""
    reg = _make_registry(tmp_path)
    user_id = "u-inv"
    pattern_slug = "test-pattern"

    result = reg.resolve_for_user(user_id, pattern_slug)
    assert result.pattern_slug == pattern_slug
    assert result.timeframe == "1h"


def test_invalidate_clears_cache_entry(tmp_path):
    """After invalidate, next resolve is a fresh call (no exception)."""
    reg = _make_registry(tmp_path)
    user_id = "u-inv2"
    pattern_slug = "test-pattern"

    # First resolution
    result1 = reg.resolve_for_user(user_id, pattern_slug)
    # Manually populate cache
    reg._cache[(user_id, pattern_slug)] = result1

    # Invalidate
    reg.invalidate(user_id, pattern_slug)
    assert (user_id, pattern_slug) not in reg._cache

    # Second resolution after invalidation must not raise
    result2 = reg.resolve_for_user(user_id, pattern_slug)
    assert result2.pattern_slug == pattern_slug
