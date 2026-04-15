from __future__ import annotations

import os
from urllib.parse import urlparse


def env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if not normalized:
        return default
    return normalized in {"1", "true", "yes", "on"}


def parse_csv_env(name: str) -> list[str]:
    raw = os.getenv(name, "")
    if not raw.strip():
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def is_production_runtime() -> bool:
    return os.getenv("ENVIRONMENT", "").strip().lower() == "production" or os.getenv("K_SERVICE", "").strip() != ""


def build_allowed_origins() -> list[str]:
    origins = [
        "http://localhost:5173",
        "http://localhost:4173",
    ]
    app_origin = os.getenv("APP_ORIGIN", "").strip()
    if app_origin:
        origins.append(app_origin)
    origins.extend(parse_csv_env("ENGINE_ALLOWED_ORIGINS"))
    return list(dict.fromkeys(origins))


def build_allowed_hosts() -> list[str]:
    hosts = [
        "localhost",
        "127.0.0.1",
        "localhost:8000",
        "127.0.0.1:8000",
    ]
    app_origin = os.getenv("APP_ORIGIN", "").strip()
    if app_origin:
        try:
            parsed = urlparse(app_origin)
            if parsed.netloc:
                hosts.append(parsed.netloc.lower())
            if parsed.hostname:
                hosts.append(parsed.hostname.lower())
        except Exception:
            pass
    hosts.extend(host.lower() for host in parse_csv_env("ENGINE_ALLOWED_HOSTS"))
    return list(dict.fromkeys(host for host in hosts if host))


def build_docs_urls() -> tuple[str | None, str | None]:
    if not env_flag("ENGINE_EXPOSE_DOCS", False):
        return None, None
    return "/docs", "/openapi.json"


def get_public_runtime_security_errors() -> list[str]:
    if not is_production_runtime():
        return []

    errors: list[str] = []
    app_origin = os.getenv("APP_ORIGIN", "").strip()
    if not app_origin:
        errors.append("APP_ORIGIN is required for engine-api in production.")
        return errors

    try:
        parsed = urlparse(app_origin)
    except Exception:
        parsed = None

    if parsed is None or parsed.scheme != "https" or not parsed.netloc:
        errors.append("APP_ORIGIN must be a valid https origin in production.")

    return errors


def get_public_runtime_security_warnings() -> list[str]:
    if not is_production_runtime():
        return []

    warnings: list[str] = []
    if not os.getenv("ENGINE_ALLOWED_HOSTS", "").strip():
        warnings.append("ENGINE_ALLOWED_HOSTS is not configured. Add an explicit host allowlist in production.")
    if env_flag("ENGINE_EXPOSE_DOCS", False):
        warnings.append("ENGINE_EXPOSE_DOCS=true exposes FastAPI docs on the public engine runtime.")
    return warnings


def assert_public_runtime_security() -> None:
    errors = get_public_runtime_security_errors()
    if errors:
        raise RuntimeError(errors[0])
