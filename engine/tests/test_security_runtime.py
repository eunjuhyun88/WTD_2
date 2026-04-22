from security_runtime import (
    build_allowed_hosts,
    build_allowed_origins,
    build_docs_urls,
    get_runtime_role,
    get_public_runtime_security_errors,
    get_public_runtime_security_warnings,
    is_internal_auth_exempt_path,
    runtime_serves_public_api,
    runtime_serves_worker_control,
    validate_internal_request,
)


def test_build_docs_urls_disabled_by_default(monkeypatch) -> None:
    monkeypatch.delenv("ENGINE_EXPOSE_DOCS", raising=False)
    assert build_docs_urls() == (None, None)


def test_build_docs_urls_can_be_enabled(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_EXPOSE_DOCS", "true")
    assert build_docs_urls() == ("/docs", "/openapi.json")


def test_build_allowed_origins_includes_local_and_configured(monkeypatch) -> None:
    monkeypatch.setenv("APP_ORIGIN", "https://app.cogotchi.dev")
    monkeypatch.setenv("ENGINE_ALLOWED_ORIGINS", "https://ops.cogotchi.dev, https://app.cogotchi.dev")

    assert build_allowed_origins() == [
        "http://localhost:5173",
        "http://localhost:4173",
        "https://app.cogotchi.dev",
        "https://ops.cogotchi.dev",
    ]


def test_build_allowed_hosts_includes_app_origin_and_env(monkeypatch) -> None:
    monkeypatch.setenv("APP_ORIGIN", "https://app.cogotchi.dev")
    monkeypatch.setenv("ENGINE_ALLOWED_HOSTS", "engine.internal:8000")

    assert build_allowed_hosts() == [
        "localhost",
        "127.0.0.1",
        "localhost:8000",
        "127.0.0.1:8000",
        "testserver",
        "testserver:80",
        "app.cogotchi.dev",
        "engine.internal:8000",
    ]


def test_production_requires_https_app_origin(monkeypatch) -> None:
    monkeypatch.setenv("K_SERVICE", "engine-api")
    monkeypatch.setenv("APP_ORIGIN", "http://app.cogotchi.dev")
    monkeypatch.setenv("ENGINE_ALLOWED_HOSTS", "engine-api-xxxx-uc.a.run.app")
    monkeypatch.setenv("ENGINE_INTERNAL_SECRET", "top-secret")

    assert get_public_runtime_security_errors() == [
        "APP_ORIGIN must be a valid https origin in production.",
    ]


def test_production_requires_host_allowlist(monkeypatch) -> None:
    monkeypatch.setenv("K_SERVICE", "engine-api")
    monkeypatch.setenv("APP_ORIGIN", "https://app.cogotchi.dev")
    monkeypatch.delenv("ENGINE_ALLOWED_HOSTS", raising=False)
    monkeypatch.delenv("ENGINE_INTERNAL_SECRET", raising=False)

    assert get_public_runtime_security_errors() == [
        "ENGINE_ALLOWED_HOSTS is required in production.",
        "ENGINE_INTERNAL_SECRET is required in production.",
    ]


def test_production_warns_when_docs_are_exposed(monkeypatch) -> None:
    monkeypatch.setenv("K_SERVICE", "engine-api")
    monkeypatch.setenv("APP_ORIGIN", "https://app.cogotchi.dev")
    monkeypatch.setenv("ENGINE_ALLOWED_HOSTS", "engine-api-xxxx-uc.a.run.app")
    monkeypatch.setenv("ENGINE_INTERNAL_SECRET", "top-secret")
    monkeypatch.setenv("ENGINE_EXPOSE_DOCS", "true")

    assert get_public_runtime_security_warnings() == [
        "ENGINE_RUNTIME_ROLE=hybrid serves public API and worker-control in the same runtime.",
        "ENGINE_EXPOSE_DOCS=true exposes FastAPI docs on the public engine runtime.",
    ]


def test_runtime_role_defaults_to_hybrid(monkeypatch) -> None:
    monkeypatch.delenv("ENGINE_RUNTIME_ROLE", raising=False)
    assert get_runtime_role() == "hybrid"
    assert runtime_serves_public_api() is True
    assert runtime_serves_worker_control() is True


def test_runtime_role_api_disables_worker_control(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_RUNTIME_ROLE", "api")
    assert get_runtime_role() == "api"
    assert runtime_serves_public_api() is True
    assert runtime_serves_worker_control() is False


def test_runtime_role_worker_disables_public_api(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_RUNTIME_ROLE", "worker")
    assert get_runtime_role() == "worker"
    assert runtime_serves_public_api() is False
    assert runtime_serves_worker_control() is True


def test_invalid_runtime_role_falls_back_to_hybrid(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_RUNTIME_ROLE", "bogus")
    assert get_runtime_role() == "hybrid"
    assert runtime_serves_public_api() is True
    assert runtime_serves_worker_control() is True


def test_production_worker_role_does_not_require_public_origin_or_internal_secret(monkeypatch) -> None:
    monkeypatch.setenv("K_SERVICE", "worker-control")
    monkeypatch.setenv("ENGINE_RUNTIME_ROLE", "worker")
    monkeypatch.setenv("ENGINE_ALLOWED_HOSTS", "worker-control-xxxx-uc.a.run.app")
    monkeypatch.delenv("APP_ORIGIN", raising=False)
    monkeypatch.delenv("ENGINE_INTERNAL_SECRET", raising=False)

    assert get_public_runtime_security_errors() == []


def test_internal_auth_exempts_health_ready_and_jobs() -> None:
    assert is_internal_auth_exempt_path("/healthz") is True
    assert is_internal_auth_exempt_path("/readyz") is True
    assert is_internal_auth_exempt_path("/jobs/pattern_scan/run") is True
    assert is_internal_auth_exempt_path("/metrics") is False
    assert is_internal_auth_exempt_path("/score") is False


def test_internal_request_validation_requires_configured_secret(monkeypatch) -> None:
    monkeypatch.delenv("ENGINE_INTERNAL_SECRET", raising=False)

    assert validate_internal_request("/score", "") == (
        503,
        "engine internal secret not configured",
    )


def test_internal_request_validation_requires_matching_secret(monkeypatch) -> None:
    monkeypatch.setenv("ENGINE_INTERNAL_SECRET", "top-secret")

    assert validate_internal_request("/score", "") == (401, "missing engine internal secret")
    assert validate_internal_request("/score", "wrong") == (403, "invalid engine internal secret")
    assert validate_internal_request("/score", "top-secret") is None
