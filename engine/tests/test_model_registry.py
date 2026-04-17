from __future__ import annotations

from pathlib import Path

from patterns.model_registry import PatternModelRegistryStore


SLUG = "tradoor-oi-reversal-v1"


def test_upsert_candidate_and_preferred_lookup(tmp_path: Path) -> None:
    store = PatternModelRegistryStore(base_dir=tmp_path / "model-registry")

    candidate = store.upsert_candidate(
        pattern_slug=SLUG,
        model_key=f"{SLUG}:1h:breakout_24h:fs1:lp1",
        model_version="20260416_120000",
        timeframe="1h",
        target_name="breakout_24h",
        feature_schema_version=1,
        label_policy_version=1,
        threshold_policy_version=1,
    )

    entries = store.list(SLUG)
    preferred = store.get_preferred_scoring_model(SLUG)

    assert len(entries) == 1
    assert candidate.rollout_state == "candidate"
    assert preferred is not None
    assert preferred.model_version == "20260416_120000"
    assert preferred.rollout_state == "candidate"


def test_promote_sets_single_active_model(tmp_path: Path) -> None:
    store = PatternModelRegistryStore(base_dir=tmp_path / "model-registry")
    first = store.upsert_candidate(
        pattern_slug=SLUG,
        model_key=f"{SLUG}:1h:breakout_24h:fs1:lp1",
        model_version="20260416_120000",
        timeframe="1h",
        target_name="breakout_24h",
        feature_schema_version=1,
        label_policy_version=1,
        threshold_policy_version=1,
    )
    second = store.upsert_candidate(
        pattern_slug=SLUG,
        model_key=f"{SLUG}:1h:breakout_48h:fs1:lp1",
        model_version="20260416_130000",
        timeframe="1h",
        target_name="breakout_48h",
        feature_schema_version=1,
        label_policy_version=1,
        threshold_policy_version=1,
    )

    active_first = store.promote(
        pattern_slug=SLUG,
        model_key=first.model_key,
        model_version=first.model_version,
        threshold_policy_version=2,
    )
    active_second = store.promote(
        pattern_slug=SLUG,
        model_key=second.model_key,
        model_version=second.model_version,
        threshold_policy_version=3,
    )
    entries = store.list(SLUG)

    assert active_first.rollout_state == "active"
    assert active_first.threshold_policy_version == 2
    assert active_second.rollout_state == "active"
    assert active_second.threshold_policy_version == 3
    assert sum(1 for entry in entries if entry.rollout_state == "active") == 1
    paused_first = next(entry for entry in entries if entry.model_version == "20260416_120000")
    current_active = store.get_active(SLUG)
    assert paused_first.rollout_state == "paused"
    assert current_active is not None
    assert current_active.model_version == "20260416_130000"
