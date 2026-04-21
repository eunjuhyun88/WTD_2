from __future__ import annotations

import os
from urllib.parse import urlparse


def _csv(name: str) -> list[str]:
    raw = os.getenv(name, "")
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def _is_production() -> bool:
    return bool(os.getenv("K_SERVICE", "").strip())


def build_allowed_origins() -> list[str]:
    app_origin = os.getenv("APP_ORIGIN", "").strip()
    extra = _csv("ENGINE_ALLOWED_ORIGINS")
    origins: list[str] = ["http://localhost:5173", "http://localhost:4173"]
    if app_origin and app_origin not in origins:
        origins.append(app_origin)
    for origin in extra:
        if origin not in origins:
            origins.append(origin)
    return origins


def build_allowed_hosts() -> list[str]:
    app_origin = os.getenv("APP_ORIGIN", "").strip()
    explicit = _csv("ENGINE_ALLOWED_HOSTS")
    hosts: list[str] = [
        "localhost",
        "127.0.0.1",
        "localhost:8000",
        "127.0.0.1:8000",
        "testserver",
        "testserver:80",
    ]
    if app_origin:
        parsed = urlparse(app_origin)
        host = parsed.netloc or None
        if host and host not in hosts:
            hosts.append(host)
    for h in explicit:
        if h not in hosts:
            hosts.append(h)
    return hosts


def build_docs_urls() -> tuple[str | None, str | None]:
    expose_docs = os.getenv("ENGINE_EXPOSE_DOCS", "false").strip().lower()
    if expose_docs in {"1", "true", "yes", "on"}:
        return "/docs", "/openapi.json"
    return None, None


def get_public_runtime_security_errors() -> list[str]:
    errors: list[str] = []
    if not _is_production():
        return errors
    app_origin = os.getenv("APP_ORIGIN", "").strip()
    if not app_origin.startswith("https://"):
        errors.append("APP_ORIGIN must be a valid https origin in production.")
    if not os.getenv("ENGINE_ALLOWED_HOSTS", "").strip():
        errors.append("ENGINE_ALLOWED_HOSTS is required in production.")
    return errors


def get_public_runtime_security_warnings() -> list[str]:
    warnings: list[str] = []
    if os.getenv("ENGINE_EXPOSE_DOCS", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        warnings.append(
            "ENGINE_EXPOSE_DOCS=true exposes FastAPI docs on the public engine runtime."
        )
    return warnings


def assert_public_runtime_security() -> None:
    errors = get_public_runtime_security_errors()
    if errors:
        raise RuntimeError(
            "Engine runtime security check failed:\n"
            + "\n".join(f"  - {e}" for e in errors)
        )
    import logging
    for warning in get_public_runtime_security_warnings():
        logging.getLogger(__name__).warning("security_runtime: %s", warning)
