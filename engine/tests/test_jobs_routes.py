from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import jobs


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(jobs.router)
    return TestClient(app)


def test_jobs_fail_closed_when_scheduler_secret_missing(monkeypatch) -> None:
    monkeypatch.setattr(jobs, "SCHEDULER_SECRET", "")

    response = _client().post("/jobs/pattern_scan/run")

    assert response.status_code == 503
    assert response.json() == {"detail": "scheduler secret not configured"}


def test_jobs_require_bearer_token_when_scheduler_secret_is_set(monkeypatch) -> None:
    monkeypatch.setattr(jobs, "SCHEDULER_SECRET", "top-secret")

    response = _client().post("/jobs/pattern_scan/run")

    assert response.status_code == 401
    assert response.json() == {"detail": "missing bearer token"}


def test_jobs_reject_invalid_scheduler_secret(monkeypatch) -> None:
    monkeypatch.setattr(jobs, "SCHEDULER_SECRET", "top-secret")

    response = _client().post(
        "/jobs/pattern_scan/run",
        headers={"Authorization": "Bearer wrong-secret"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "invalid scheduler secret"}
