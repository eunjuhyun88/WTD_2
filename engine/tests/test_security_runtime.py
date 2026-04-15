from security_runtime import (
    build_allowed_hosts,
    build_allowed_origins,
    build_docs_urls,
    get_public_runtime_security_errors,
    get_public_runtime_security_warnings,
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
        "app.cogotchi.dev",
        "engine.internal:8000",
    ]


def test_production_requires_https_app_origin(monkeypatch) -> None:
    monkeypatch.setenv("K_SERVICE", "engine-api")
    monkeypatch.setenv("APP_ORIGIN", "http://app.cogotchi.dev")
    monkeypatch.setenv("ENGINE_ALLOWED_HOSTS", "engine-api-xxxx-uc.a.run.app")

    assert get_public_runtime_security_errors() == [
        "APP_ORIGIN must be a valid https origin in production.",
    ]


def test_production_requires_host_allowlist(monkeypatch) -> None:
    monkeypatch.setenv("K_SERVICE", "engine-api")
    monkeypatch.setenv("APP_ORIGIN", "https://app.cogotchi.dev")
    monkeypatch.delenv("ENGINE_ALLOWED_HOSTS", raising=False)

    assert get_public_runtime_security_errors() == [
        "ENGINE_ALLOWED_HOSTS is required in production.",
    ]


def test_production_warns_when_docs_are_exposed(monkeypatch) -> None:
    monkeypatch.setenv("K_SERVICE", "engine-api")
    monkeypatch.setenv("APP_ORIGIN", "https://app.cogotchi.dev")
    monkeypatch.setenv("ENGINE_ALLOWED_HOSTS", "engine-api-xxxx-uc.a.run.app")
    monkeypatch.setenv("ENGINE_EXPOSE_DOCS", "true")

    assert get_public_runtime_security_warnings() == [
        "ENGINE_EXPOSE_DOCS=true exposes FastAPI docs on the public engine runtime.",
    ]
