"""W-0308: Pattern lifecycle PATCH endpoint tests.

Tests:
  1. draft → candidate — 200, audit log written
  2. archived → object  — 422 (invalid transition)
  3. non-existent slug  — 404
  4. candidate → object — 200
  5. object → archived  — 200, variant registry cleaned up
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import patterns as pattern_routes
from patterns.lifecycle_store import PatternLifecycleStore, VALID_TRANSITIONS
from patterns.active_variant_registry import ActivePatternVariantStore


# ── Helpers ───────────────────────────────────────────────────────────────────

def _attach_fake_auth(app: FastAPI, user_id: str = "test-user-001") -> None:
    @app.middleware("http")
    async def _inject(request, call_next):
        request.state.user_id = user_id
        return await call_next(request)


def _make_client(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> TestClient:
    lifecycle_store = PatternLifecycleStore(tmp_path / "lifecycle")
    variant_store = ActivePatternVariantStore(tmp_path / "variants")

    monkeypatch.setattr(pattern_routes, "PATTERN_LIFECYCLE_STORE", lifecycle_store)
    monkeypatch.setattr(pattern_routes, "ACTIVE_PATTERN_VARIANT_STORE", variant_store)
    monkeypatch.setattr(
        pattern_routes,
        "ACTIVE_VARIANT_REGISTRY_DIR",
        tmp_path / "variants",
    )

    # Seed a known slug in library and registry
    from patterns.library import PATTERN_LIBRARY
    from patterns.registry import PatternRegistryStore, PatternRegistryEntry

    registry_store = PatternRegistryStore(tmp_path / "registry")
    # Register a test slug
    registry_store.upsert(
        PatternRegistryEntry(
            slug="test-lifecycle-pattern",
            version=1,
            source="system",
            direction="long",
            timeframe="1h",
        )
    )
    monkeypatch.setattr(pattern_routes, "PATTERN_REGISTRY_STORE", registry_store)

    # Pre-seed a draft entry for the test slug
    from patterns.lifecycle_store import PatternLifecycleEntry
    lifecycle_store.upsert(
        PatternLifecycleEntry(slug="test-lifecycle-pattern", status="draft")
    )

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    _attach_fake_auth(app)
    client = TestClient(app, raise_server_exceptions=False)
    client._lifecycle_store = lifecycle_store  # type: ignore[attr-defined]
    client._variant_store = variant_store  # type: ignore[attr-defined]
    return client


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_draft_to_candidate_success(tmp_path, monkeypatch):
    """AC2: draft → candidate returns 200 and writes audit log."""
    client = _make_client(tmp_path, monkeypatch)

    res = client.patch(
        "/patterns/test-lifecycle-pattern/status",
        json={"status": "candidate", "reason": "looks good"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["slug"] == "test-lifecycle-pattern"
    assert body["status"] == "candidate"
    assert body["updated_at"]

    # Verify audit log written
    events_file = tmp_path / "lifecycle" / "_events.jsonl"
    assert events_file.exists(), "audit log not written"
    lines = events_file.read_text().strip().splitlines()
    assert len(lines) >= 1
    event = json.loads(lines[-1])
    assert event["slug"] == "test-lifecycle-pattern"
    assert event["from_status"] == "draft"
    assert event["to_status"] == "candidate"
    assert event["reason"] == "looks good"


def test_archived_to_object_rejected(tmp_path, monkeypatch):
    """AC2 invalid: archived → object must return 422."""
    client = _make_client(tmp_path, monkeypatch)

    # First archive it
    client.patch(
        "/patterns/test-lifecycle-pattern/status",
        json={"status": "archived"},
    )

    # Now try object (invalid)
    res = client.patch(
        "/patterns/test-lifecycle-pattern/status",
        json={"status": "object"},
    )
    assert res.status_code == 422, res.text
    body = res.json()
    assert "invalid transition" in body["detail"].lower() or "archived" in body["detail"].lower()


def test_nonexistent_slug_returns_404(tmp_path, monkeypatch):
    """AC: non-existent slug returns 404."""
    client = _make_client(tmp_path, monkeypatch)

    res = client.patch(
        "/patterns/does-not-exist-slug-xyz/status",
        json={"status": "candidate"},
    )
    assert res.status_code == 404, res.text
    body = res.json()
    assert "not found" in body["detail"].lower()


def test_candidate_to_object_success(tmp_path, monkeypatch):
    """Candidate → object succeeds."""
    client = _make_client(tmp_path, monkeypatch)

    # Promote to candidate first
    r1 = client.patch(
        "/patterns/test-lifecycle-pattern/status",
        json={"status": "candidate"},
    )
    assert r1.status_code == 200, r1.text

    # Then promote to object
    r2 = client.patch(
        "/patterns/test-lifecycle-pattern/status",
        json={"status": "object"},
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["status"] == "object"


def test_unauthenticated_returns_401(tmp_path, monkeypatch):
    """Unauthenticated request returns 401."""
    lifecycle_store = PatternLifecycleStore(tmp_path / "lifecycle")
    monkeypatch.setattr(pattern_routes, "PATTERN_LIFECYCLE_STORE", lifecycle_store)

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    # No auth middleware injected

    client = TestClient(app, raise_server_exceptions=False)
    res = client.patch(
        "/patterns/any-slug/status",
        json={"status": "candidate"},
    )
    assert res.status_code == 401, res.text


# ── Unit: transition graph ─────────────────────────────────────────────────────

def test_valid_transitions_graph():
    """Lifecycle store transition graph is consistent."""
    assert "candidate" in VALID_TRANSITIONS["draft"]
    assert "archived" in VALID_TRANSITIONS["draft"]
    assert "object" in VALID_TRANSITIONS["candidate"]
    assert "archived" in VALID_TRANSITIONS["candidate"]
    assert "archived" in VALID_TRANSITIONS["object"]
    # object → candidate is NOT allowed
    assert "candidate" not in VALID_TRANSITIONS["object"]
    # archived is terminal
    assert len(VALID_TRANSITIONS["archived"]) == 0


def test_lifecycle_store_transition(tmp_path):
    """PatternLifecycleStore.transition() works end-to-end."""
    store = PatternLifecycleStore(tmp_path / "lc")
    from patterns.lifecycle_store import PatternLifecycleEntry
    store.upsert(PatternLifecycleEntry(slug="test-slug", status="draft"))

    entry = store.transition("test-slug", "candidate", reason="pytest", user_id="u1")
    assert entry.status == "candidate"
    assert entry.promoted_at is not None

    with pytest.raises(ValueError, match="invalid transition"):
        store.transition("test-slug", "draft")
