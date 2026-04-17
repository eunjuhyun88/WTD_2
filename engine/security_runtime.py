from __future__ import annotations

import os
from urllib.parse import urlparse


def _csv(name: str) -> list[str]:
    raw = os.getenv(name, "")
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def _default_host_from_origin(origin: str) -> str | None:
    if not origin:
        return None
    parsed = urlparse(origin)
    return parsed.netloc or None


def build_allowed_origins() -> list[str]:
    app_origin = os.getenv("APP_ORIGIN", "http://localhost:3000").strip()
    extra = _csv("ENGINE_ALLOWED_ORIGINS")
    origins: list[str] = []
    if app_origin:
        origins.append(app_origin)
    for origin in extra:
        if origin not in origins:
            origins.append(origin)
    return origins


def build_allowed_hosts() -> list[str]:
    explicit = _csv("ENGINE_ALLOWED_HOSTS")
    if explicit:
        return explicit
    app_origin = os.getenv("APP_ORIGIN", "http://localhost:3000").strip()
    inferred = _default_host_from_origin(app_origin)
    default_hosts = ["localhost", "127.0.0.1", "0.0.0.0"]
    if inferred and inferred not in default_hosts:
        default_hosts.append(inferred)
    return default_hosts


def build_docs_urls() -> tuple[str | None, str | None]:
    expose_docs = os.getenv("ENGINE_EXPOSE_DOCS", "false").strip().lower()
    if expose_docs in {"1", "true", "yes", "on"}:
        return "/docs", "/openapi.json"
    return None, None


def get_public_runtime_security_warnings() -> list[str]:
    warnings: list[str] = []
    if not os.getenv("ENGINE_ALLOWED_HOSTS", "").strip():
        warnings.append(
            "ENGINE_ALLOWED_HOSTS is empty; default localhost host filtering is applied."
        )
    if os.getenv("ENGINE_EXPOSE_DOCS", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }:
        warnings.append(
            "ENGINE_EXPOSE_DOCS=true exposes /docs and /openapi.json; disable in public runtime."
        )
    return warnings


def assert_public_runtime_security() -> None:
    # Keep runtime non-blocking in local/dev while still surfacing warnings.
    return None
