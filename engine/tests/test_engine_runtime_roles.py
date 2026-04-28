from __future__ import annotations

from fastapi import FastAPI

from api import main


def _paths(app: FastAPI) -> set[str]:
    return {route.path for route in app.routes}


def test_include_engine_routes_excludes_jobs_in_api_role() -> None:
    app = FastAPI()
    main.include_engine_routes(app, runtime_role="api")

    assert "/jobs/status" not in _paths(app)
    assert "/chart/klines" in _paths(app)
    assert "/patterns/library" in _paths(app)


def test_include_engine_routes_limits_worker_role_to_worker_control_surface() -> None:
    app = FastAPI()
    main.include_engine_routes(app, runtime_role="worker")

    assert "/jobs/status" in _paths(app)
    assert "/chart/klines" not in _paths(app)
    assert "/patterns/library" not in _paths(app)


def test_include_engine_routes_keeps_hybrid_compatibility() -> None:
    app = FastAPI()
    main.include_engine_routes(app, runtime_role="hybrid")

    assert "/jobs/status" in _paths(app)
    assert "/chart/klines" in _paths(app)
    assert "/patterns/library" in _paths(app)


def test_scheduler_disabled_for_api_runtime(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_RUNTIME_ROLE", "api")
    monkeypatch.setenv("ENGINE_ENABLE_SCHEDULER", "true")

    assert main.scheduler_enabled() is False


def test_scheduler_enabled_for_worker_runtime(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_RUNTIME_ROLE", "worker")
    monkeypatch.setenv("ENGINE_ENABLE_SCHEDULER", "true")

    assert main.scheduler_enabled() is True


def test_readyz_reports_runtime_role(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_RUNTIME_ROLE", "api")

    def _readiness_payload(version: str, *, scheduler_enabled: bool, runtime_role: str) -> dict:
        return {
            "version": version,
            "scheduler_enabled": scheduler_enabled,
            "runtime_role": runtime_role,
        }

    monkeypatch.setattr(main, "readiness_payload", _readiness_payload)

    import json
    data = json.loads(main.readyz().body)
    assert data["runtime_role"] == "api"
    assert data["scheduler_enabled"] is False
