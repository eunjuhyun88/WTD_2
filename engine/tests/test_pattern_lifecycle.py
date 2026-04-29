from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import patterns as pattern_routes
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
    monkeypatch.setattr(pattern_routes, "get_lifecycle_store", lambda: store)

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    initial = client.get("/patterns/tradoor-oi-reversal-v1/lifecycle-status")
    assert initial.status_code == 200
    assert initial.json()["status"] == "draft"

    promoted = client.patch(
        "/patterns/tradoor-oi-reversal-v1/status",
        json={"status": "candidate", "reason": "manual review"},
        headers={"x-user-id": "jin"},
    )
    assert promoted.status_code == 200
    assert promoted.json()["from_status"] == "draft"
    assert promoted.json()["to_status"] == "candidate"

    invalid = client.patch(
        "/patterns/tradoor-oi-reversal-v1/status",
        json={"status": "draft"},
    )
    assert invalid.status_code == 422


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
