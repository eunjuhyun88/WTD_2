"""Tests for GET /metrics/user/{user_id}/wvpl route — JWT enforcement + happy path."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import metrics_user
from ledger.store import LedgerRecordStore
from ledger.types import PatternLedgerRecord
from observability.wvpl import KST


def _attach_auth(app: FastAPI, user_id: str | None) -> None:
    @app.middleware("http")
    async def _inject_user(request, call_next):
        if user_id is not None:
            request.state.user_id = user_id
        return await call_next(request)


def _build_app(authed_user: str | None) -> FastAPI:
    app = FastAPI()
    _attach_auth(app, authed_user)
    app.include_router(metrics_user.router, prefix="/metrics", tags=["metrics"])
    return app


@pytest.fixture
def seeded_store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> LedgerRecordStore:
    store = LedgerRecordStore(base_dir=tmp_path / "ledger-records")
    # Seed one complete loop in current week for "founder"
    now = datetime.now(tz=KST)
    store.append(
        PatternLedgerRecord(
            record_type="capture",
            pattern_slug="pat-A",
            user_id="founder",
            created_at=now,
        )
    )
    store.append(
        PatternLedgerRecord(
            record_type="verdict",
            pattern_slug="pat-A",
            user_id="founder",
            created_at=now,
        )
    )
    monkeypatch.setattr(metrics_user, "LEDGER_RECORD_STORE", store)
    return store


def test_unauthenticated_request_returns_401(seeded_store: LedgerRecordStore) -> None:
    app = _build_app(authed_user=None)
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/metrics/user/founder/wvpl")
    assert resp.status_code == 401


def test_cross_user_request_returns_403(seeded_store: LedgerRecordStore) -> None:
    app = _build_app(authed_user="alice")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/metrics/user/founder/wvpl")
    assert resp.status_code == 403


def test_self_request_returns_weekly_breakdowns(
    seeded_store: LedgerRecordStore,
) -> None:
    app = _build_app(authed_user="founder")
    client = TestClient(app)
    resp = client.get("/metrics/user/founder/wvpl?weeks=4")
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == "founder"
    assert len(data["weeks"]) == 4
    # Most recent week (offset 0) should have the seeded loop
    current = data["weeks"][0]
    assert current["loop_count"] == 1
    assert current["capture_n"] == 1
    assert current["verdict_n"] == 1


def test_weeks_query_param_validation(seeded_store: LedgerRecordStore) -> None:
    app = _build_app(authed_user="founder")
    client = TestClient(app, raise_server_exceptions=False)
    # weeks=0 should fail validation (ge=1)
    resp = client.get("/metrics/user/founder/wvpl?weeks=0")
    assert resp.status_code == 422
    # weeks=53 should fail validation (le=52)
    resp = client.get("/metrics/user/founder/wvpl?weeks=53")
    assert resp.status_code == 422
