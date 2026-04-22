from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.main import request_id_middleware


def _client() -> TestClient:
    app = FastAPI()
    app.middleware("http")(request_id_middleware)

    @app.get("/healthz")
    def healthz() -> dict:
        return {"ok": True}

    @app.get("/score")
    def score() -> dict:
        return {"ok": True}

    @app.get("/metrics")
    def metrics() -> dict:
        return {"ok": True}

    return TestClient(app)


def test_internal_auth_middleware_allows_exempt_health_endpoint(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_INTERNAL_SECRET", "top-secret")

    response = _client().get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert response.headers["x-request-id"]


def test_internal_auth_middleware_rejects_missing_secret(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_INTERNAL_SECRET", "top-secret")

    response = _client().get("/score")

    assert response.status_code == 401
    assert response.json() == {"detail": "missing engine internal secret"}
    assert response.headers["x-request-id"]


def test_internal_auth_middleware_rejects_metrics_without_secret(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_INTERNAL_SECRET", "top-secret")

    response = _client().get("/metrics")

    assert response.status_code == 401
    assert response.json() == {"detail": "missing engine internal secret"}
    assert response.headers["x-request-id"]


def test_internal_auth_middleware_allows_matching_secret(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_INTERNAL_SECRET", "top-secret")

    response = _client().get(
        "/score",
        headers={"x-engine-internal-secret": "top-secret"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert response.headers["x-request-id"]
