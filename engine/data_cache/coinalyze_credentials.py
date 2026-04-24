"""Small Coinalyze credential resolver for engine-owned ingress."""
from __future__ import annotations

import os
from dataclasses import dataclass

try:
    import env_bootstrap  # noqa: F401
except ModuleNotFoundError:
    from engine import env_bootstrap  # type: ignore  # noqa: F401

_COINALYZE_API_KEY_ENV_ALIASES: tuple[str, ...] = (
    "COINALYZE_API_KEY",
    "COINALYZE_KEY",
)
_PLACEHOLDER_HINTS = ("your_", "your-", "placeholder", "changeme", "dummy", "example", "<")


@dataclass(frozen=True)
class CoinalyzeApiKeyResolution:
    env_var: str | None
    state: str
    value: str | None

    @property
    def present(self) -> bool:
        return self.state == "configured" and bool(self.value)


def _is_placeholder_like(value: str) -> bool:
    normalized = value.strip().lower()
    if not normalized:
        return False
    return any(hint in normalized for hint in _PLACEHOLDER_HINTS)


def resolve_coinalyze_api_key() -> CoinalyzeApiKeyResolution:
    for env_var in _COINALYZE_API_KEY_ENV_ALIASES:
        value = os.environ.get(env_var, "").strip()
        if not value:
            continue
        if _is_placeholder_like(value):
            return CoinalyzeApiKeyResolution(env_var=env_var, state="placeholder", value=None)
        return CoinalyzeApiKeyResolution(env_var=env_var, state="configured", value=value)
    return CoinalyzeApiKeyResolution(env_var=None, state="missing", value=None)
