"""Sentry SDK wrapper — graceful no-op when SENTRY_DSN is unset."""
from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

log = logging.getLogger("engine.observability.sentry")

_initialized = False


def init_sentry(*, release: str | None = None) -> None:
    """Initialize Sentry from SENTRY_DSN env var.

    No-op if SENTRY_DSN is unset (CI, local dev without Sentry account).
    """
    global _initialized
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        log.debug("SENTRY_DSN not set — Sentry disabled")
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:
        log.warning("sentry-sdk not installed — Sentry disabled")
        return

    sample_rate = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1"))
    git_sha = os.getenv("GIT_SHA", "unknown")
    env_name = os.getenv("SENTRY_ENVIRONMENT", "production")

    sentry_sdk.init(
        dsn=dsn,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
        traces_sample_rate=sample_rate,
        release=release or git_sha,
        environment=env_name,
        send_default_pii=False,
        before_send=_filter_pii,
    )
    _initialized = True
    log.info("Sentry initialized (env=%s, traces_rate=%.2f)", env_name, sample_rate)


def _filter_pii(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any] | None:
    """Strip PII fields from Sentry events before sending."""
    for exc_val in event.get("exception", {}).get("values", []):
        for frame in exc_val.get("stacktrace", {}).get("frames", []):
            for key in list(frame.get("vars", {}).keys()):
                if any(s in key.lower() for s in (
                    "wallet", "address", "email", "token", "secret", "password", "key",
                )):
                    frame["vars"][key] = "[Filtered]"
    return event


def capture_exception(exc: Exception, **tags: Any) -> None:
    """Capture exception to Sentry. No-op if not initialized."""
    if not _initialized:
        return
    try:
        import sentry_sdk
        with sentry_sdk.new_scope() as scope:
            for k, v in tags.items():
                scope.set_tag(k, str(v))
            sentry_sdk.capture_exception(exc)
    except Exception:
        pass


def set_user(user_id: str) -> None:
    """Set hashed user context for Sentry. No-op if not initialized."""
    if not _initialized:
        return
    try:
        import sentry_sdk
        hashed = hashlib.sha256(user_id.encode()).hexdigest()[:16]
        sentry_sdk.set_user({"id": hashed})
    except Exception:
        pass
