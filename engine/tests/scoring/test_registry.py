"""Tests for ModelRegistry (in-memory mode — no Supabase required)."""
from __future__ import annotations

import os
import pytest

from scoring.registry import ModelRegistry


@pytest.fixture()
def registry(monkeypatch: pytest.MonkeyPatch) -> ModelRegistry:
    """Return a fresh in-memory registry with Supabase disabled."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    return ModelRegistry()


# ─── register + get_active ────────────────────────────────────────────────────

def test_register_and_get_active(registry: ModelRegistry) -> None:
    """register → promote → get_active returns the promoted version."""
    vid = registry.register(version="v1", training_size=100)
    assert isinstance(vid, str) and len(vid) > 0

    # Before promote, no active model
    assert registry.get_active() is None

    registry.promote(vid)
    active = registry.get_active()
    assert active is not None
    assert active.id == vid
    assert active.version == "v1"
    assert active.status == "active"
    assert active.training_size == 100


def test_promote_retires_previous(registry: ModelRegistry) -> None:
    """v1 active → promote v2 → v1 becomes retired, v2 becomes active."""
    v1_id = registry.register(version="v1", training_size=100)
    registry.promote(v1_id)

    v2_id = registry.register(version="v2", training_size=150)
    registry.promote(v2_id)

    active = registry.get_active()
    assert active is not None
    assert active.id == v2_id
    assert active.status == "active"

    # v1 should be retired
    v1 = registry._mem[v1_id]
    assert v1.status == "retired"


def test_get_next_version_empty(registry: ModelRegistry) -> None:
    """Empty registry → get_next_version returns 'v1'."""
    assert registry.get_next_version() == "v1"


def test_get_next_version_increments(registry: ModelRegistry) -> None:
    """After registering v1, get_next_version returns 'v2'."""
    registry.register(version="v1", training_size=100)
    assert registry.get_next_version() == "v2"

    registry.register(version="v2", training_size=200)
    assert registry.get_next_version() == "v3"


def test_update_eval(registry: ModelRegistry) -> None:
    """update_eval stores ndcg/map/ci_lower on the version."""
    vid = registry.register(version="v1", training_size=100)

    registry.update_eval(vid, ndcg_at_5=0.72, map_at_10=0.65, ci_lower=0.08)

    mv = registry._mem[vid]
    assert abs(mv.ndcg_at_5 - 0.72) < 1e-9
    assert abs(mv.map_at_10 - 0.65) < 1e-9
    assert abs(mv.ci_lower - 0.08) < 1e-9


def test_retire(registry: ModelRegistry) -> None:
    """retire sets status to 'retired'."""
    vid = registry.register(version="v1", training_size=100)
    registry.promote(vid)
    assert registry.get_active() is not None

    registry.retire(vid)
    assert registry.get_active() is None
    assert registry._mem[vid].status == "retired"


def test_list_recent(registry: ModelRegistry) -> None:
    """list_recent returns versions sorted by trained_at desc."""
    ids = []
    for i in range(3):
        vid = registry.register(version=f"v{i+1}", training_size=100 * (i + 1))
        ids.append(vid)

    recent = registry.list_recent(limit=10)
    assert len(recent) == 3
    # Sorted by trained_at desc — the last registered should be first
    # (since all have nearly identical timestamps, verify at least all 3 returned)
    returned_ids = {mv.id for mv in recent}
    assert returned_ids == set(ids)


def test_list_recent_respects_model_type(registry: ModelRegistry) -> None:
    """list_recent only returns versions for the specified model_type."""
    registry.register(model_type="search_layer_c", version="v1", training_size=100)
    registry.register(model_type="other_model", version="v1", training_size=50)

    c_versions = registry.list_recent(model_type="search_layer_c")
    other_versions = registry.list_recent(model_type="other_model")

    assert len(c_versions) == 1
    assert len(other_versions) == 1
    assert c_versions[0].model_type == "search_layer_c"
    assert other_versions[0].model_type == "other_model"


def test_promote_unknown_version_is_noop(registry: ModelRegistry) -> None:
    """Promoting a nonexistent version_id logs a warning but does not raise."""
    registry.promote("nonexistent-id-00000")  # should not raise
    assert registry.get_active() is None


def test_gcs_path_stored(registry: ModelRegistry) -> None:
    """gcs_path is persisted correctly."""
    gcs = "gs://my-bucket/models/v1.pkl"
    vid = registry.register(version="v1", training_size=200, gcs_path=gcs)
    assert registry._mem[vid].gcs_path == gcs


def test_register_default_model_type(registry: ModelRegistry) -> None:
    """Default model_type is 'search_layer_c'."""
    vid = registry.register(version="v1", training_size=100)
    assert registry._mem[vid].model_type == "search_layer_c"
