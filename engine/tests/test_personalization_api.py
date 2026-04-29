"""W-0321 — personalization API endpoint tests.

Uses httpx AsyncClient against the FastAPI app in test mode.
Auth is bypassed by patching request.state.user_id.
"""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

import personalization.api as papi
from personalization.affinity_registry import AffinityRegistry
from personalization.pattern_state_store import PatternStateStore
from personalization.threshold_adapter import ThresholdAdapter


@pytest.fixture(autouse=True)
def _isolated_stores(tmp_path, monkeypatch):
    """Redirect module-level singletons to tmp_path for test isolation."""
    affinity = AffinityRegistry(
        store_path=tmp_path / "affinity",
        audit_log_path=tmp_path / "audit.jsonl",
    )
    store = PatternStateStore(store_path=tmp_path / "states")
    adapter = ThresholdAdapter(global_priors={})
    monkeypatch.setattr(papi, "_affinity_registry", affinity)
    monkeypatch.setattr(papi, "_state_store", store)
    monkeypatch.setattr(papi, "_threshold_adapter", adapter)


def _make_app():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(papi.router)
    return app


def _auth_request(user_id: str = "test-user"):
    """Build a mock Request with user_id set."""
    mock_req = MagicMock(spec=Request)
    mock_req.state = MagicMock()
    mock_req.state.user_id = user_id
    return mock_req


def test_post_verdict_cold_start_returns_no_delta(tmp_path):
    """n < 10 → mode=cold_start, delta=null."""
    app = _make_app()
    client = TestClient(app)

    with patch("personalization.api.Request") as _:
        # Inject auth by patching _require_self
        with patch.object(papi, "_require_self", return_value=None):
            resp = client.post("/verdict", json={
                "user_id": "cold-user",
                "pattern_slug": "btc-doji",
                "verdict": "near_miss",
                "captured_at": "2026-04-30T10:00:00+00:00",
            })

    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "cold_start"
    assert data["delta"] is None
    assert 0.0 <= data["affinity_score"] <= 1.0


def test_post_verdict_warm_returns_delta(tmp_path, monkeypatch):
    """After 10 verdicts, mode=personalized and delta is non-null."""
    app = _make_app()
    client = TestClient(app)
    adapter = ThresholdAdapter(global_priors={
        "btc-doji": {"near_miss": 0.2, "valid": 0.5, "invalid": 0.15,
                      "too_early": 0.1, "too_late": 0.05}
    })
    monkeypatch.setattr(papi, "_threshold_adapter", adapter)

    with patch.object(papi, "_require_self", return_value=None):
        for _ in range(9):
            client.post("/verdict", json={
                "user_id": "warm-user",
                "pattern_slug": "btc-doji",
                "verdict": "near_miss",
                "captured_at": "2026-04-30T10:00:00+00:00",
            })
        resp = client.post("/verdict", json={
            "user_id": "warm-user",
            "pattern_slug": "btc-doji",
            "verdict": "near_miss",
            "captured_at": "2026-04-30T10:00:00+00:00",
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "personalized"
    assert data["delta"] is not None
    assert data["delta"]["stop_mul_delta"] > 0  # near_miss dominant → loosen stop


def test_get_affinity_returns_user_patterns(monkeypatch):
    """After posting verdicts, GET /user/{uid}/affinity returns scored patterns."""
    app = _make_app()
    client = TestClient(app)

    with patch.object(papi, "_require_self", return_value=None):
        for slug in ("pat-a", "pat-b"):
            for _ in range(3):
                client.post("/verdict", json={
                    "user_id": "aff-user",
                    "pattern_slug": slug,
                    "verdict": "valid",
                    "captured_at": "2026-04-30T00:00:00+00:00",
                })

        resp = client.get("/user/aff-user/affinity?top_k=5")

    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == "aff-user"
    assert len(data["patterns"]) == 2
    slugs = {p["pattern_slug"] for p in data["patterns"]}
    assert slugs == {"pat-a", "pat-b"}
