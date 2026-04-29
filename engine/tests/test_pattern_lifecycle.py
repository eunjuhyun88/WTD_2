from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import patterns as pattern_routes
from patterns.active_variant_registry import ActivePatternVariantEntry, ActivePatternVariantStore
from patterns.lifecycle_store import PatternLifecycleStore


def test_lifecycle_store_allows_forward_transitions_and_writes_audit(tmp_path: Path) -> None:
    store = PatternLifecycleStore(store_dir=tmp_path)

    first = store.transition("tradoor-oi-reversal-v1", "candidate", user_id="jin", reason="reviewed")
    second = store.transition("tradoor-oi-reversal-v1", "object", user_id="jin", reason="ready")

    assert first["from_status"] == "draft"
    assert first["to_status"] == "candidate"
    assert second["from_status"] == "candidate"
    assert second["to_status"] == "object"
    assert store.get_status("tradoor-oi-reversal-v1") == "object"

    audit_lines = (tmp_path / "audit.jsonl").read_text().splitlines()
    audit_entries = [json.loads(line) for line in audit_lines]
    assert [entry["to_status"] for entry in audit_entries] == ["candidate", "object"]
    assert audit_entries[0]["user_id"] == "jin"


def test_lifecycle_store_rejects_invalid_transition(tmp_path: Path) -> None:
    store = PatternLifecycleStore(store_dir=tmp_path)

    with pytest.raises(ValueError, match="not allowed"):
        store.transition("tradoor-oi-reversal-v1", "object")

    store.transition("tradoor-oi-reversal-v1", "candidate")
    store.transition("tradoor-oi-reversal-v1", "archived")

    with pytest.raises(ValueError, match="not allowed"):
        store.transition("tradoor-oi-reversal-v1", "object")


def test_pattern_lifecycle_routes_transition_and_reject_invalid(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = PatternLifecycleStore(store_dir=tmp_path)
    variant_store = ActivePatternVariantStore(tmp_path / "variants")
    variant_store.upsert(
        ActivePatternVariantEntry(
            pattern_slug="tradoor-oi-reversal-v1",
            variant_slug="tradoor-oi-reversal-v1__canonical",
            timeframe="1h",
            watch_phases=["ACCUMULATION"],
        )
    )
    monkeypatch.setattr(pattern_routes, "get_lifecycle_store", lambda: store)
    monkeypatch.setattr(pattern_routes, "ACTIVE_PATTERN_VARIANT_STORE", variant_store)
    monkeypatch.setattr(pattern_routes, "ACTIVE_VARIANT_REGISTRY_DIR", tmp_path / "variants")

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    initial = client.get("/patterns/tradoor-oi-reversal-v1/lifecycle-status")
    assert initial.status_code == 200
    assert initial.json()["status"] == "object"

    invalid = client.patch(
        "/patterns/tradoor-oi-reversal-v1/status",
        json={"status": "candidate", "reason": "manual review"},
        headers={"x-user-id": "jin"},
    )
    assert invalid.status_code == 422

    archived = client.patch(
        "/patterns/tradoor-oi-reversal-v1/status",
        json={"status": "archived", "reason": "retired"},
        headers={"x-user-id": "jin"},
    )
    assert archived.status_code == 200
    assert archived.json()["from_status"] == "object"
    assert archived.json()["to_status"] == "archived"
    assert variant_store.get("tradoor-oi-reversal-v1") is None


def test_pattern_lifecycle_list_defaults_library_patterns_to_object(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = PatternLifecycleStore(store_dir=tmp_path)
    monkeypatch.setattr(pattern_routes, "get_lifecycle_store", lambda: store)

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get("/patterns/lifecycle")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["count"] >= 1

    tradoor = next(e for e in body["entries"] if e["slug"] == "tradoor-oi-reversal-v1")
    assert tradoor["status"] == "object"
    assert tradoor["timeframe"] == "1h"


def test_pattern_lifecycle_list_uses_explicit_status(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = PatternLifecycleStore(store_dir=tmp_path)
    store.transition(
        "tradoor-oi-reversal-v1",
        "archived",
        user_id="jin",
        reason="retired",
        default_from_status="object",
    )
    monkeypatch.setattr(pattern_routes, "get_lifecycle_store", lambda: store)

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get("/patterns/lifecycle")
    assert response.status_code == 200
    tradoor = next(e for e in response.json()["entries"] if e["slug"] == "tradoor-oi-reversal-v1")
    assert tradoor["status"] == "archived"
    assert tradoor["updated_by"] == "jin"


def test_pattern_lifecycle_route_rejects_unknown_pattern(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = PatternLifecycleStore(store_dir=tmp_path)
    monkeypatch.setattr(pattern_routes, "get_lifecycle_store", lambda: store)

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.patch("/patterns/not-a-pattern/status", json={"status": "candidate"})
    assert response.status_code == 404
