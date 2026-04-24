"""Small Binance credential resolvers for engine-owned data ingress."""
from __future__ import annotations

import os
from dataclasses import dataclass

try:
    import env_bootstrap  # noqa: F401
except ModuleNotFoundError:
    from engine import env_bootstrap  # type: ignore  # noqa: F401

_BINANCE_API_KEY_ENV_ALIASES: tuple[str, ...] = (
    "BINANCE_API_KEY",
    "BINANCE_FAPI_API_KEY",
    "BINANCE_FUTURES_API_KEY",
    "BINANCE_KEY",
)
_BINANCE_API_SECRET_ENV_ALIASES: tuple[str, ...] = (
    "BINANCE_API_SECRET",
    "BINANCE_FAPI_API_SECRET",
    "BINANCE_FUTURES_API_SECRET",
    "BINANCE_SECRET",
)
_PLACEHOLDER_HINTS = ("your_", "your-", "placeholder", "changeme", "dummy", "example", "<")


@dataclass(frozen=True)
class BinanceApiKeyResolution:
    env_var: str | None
    state: str
    value: str | None

    @property
    def present(self) -> bool:
        return self.state == "configured" and bool(self.value)


@dataclass(frozen=True)
class BinanceUserDataCredentialsResolution:
    api_key_env_var: str | None
    api_secret_env_var: str | None
    state: str
    api_key: str | None
    api_secret: str | None

    @property
    def env_var(self) -> str | None:
        if self.api_key_env_var and self.api_secret_env_var:
            return f"{self.api_key_env_var}:{self.api_secret_env_var}"
        return self.api_key_env_var or self.api_secret_env_var

    @property
    def present(self) -> bool:
        return self.state == "configured" and bool(self.api_key) and bool(self.api_secret)


def _is_placeholder_like(value: str) -> bool:
    normalized = value.strip().lower()
    if not normalized:
        return False
    return any(hint in normalized for hint in _PLACEHOLDER_HINTS)


def resolve_binance_api_key() -> BinanceApiKeyResolution:
    for env_var in _BINANCE_API_KEY_ENV_ALIASES:
        value = os.environ.get(env_var, "").strip()
        if not value:
            continue
        if _is_placeholder_like(value):
            return BinanceApiKeyResolution(env_var=env_var, state="placeholder", value=None)
        return BinanceApiKeyResolution(env_var=env_var, state="configured", value=value)
    return BinanceApiKeyResolution(env_var=None, state="missing", value=None)


def _resolve_env_alias(aliases: tuple[str, ...]) -> tuple[str | None, str | None, bool]:
    for env_var in aliases:
        value = os.environ.get(env_var, "").strip()
        if not value:
            continue
        if _is_placeholder_like(value):
            return env_var, None, True
        return env_var, value, False
    return None, None, False


def resolve_binance_user_data_credentials() -> BinanceUserDataCredentialsResolution:
    key_env_var, api_key, key_placeholder = _resolve_env_alias(_BINANCE_API_KEY_ENV_ALIASES)
    secret_env_var, api_secret, secret_placeholder = _resolve_env_alias(_BINANCE_API_SECRET_ENV_ALIASES)

    if key_placeholder or secret_placeholder:
        return BinanceUserDataCredentialsResolution(
            api_key_env_var=key_env_var,
            api_secret_env_var=secret_env_var,
            state="placeholder",
            api_key=None,
            api_secret=None,
        )
    if api_key and api_secret:
        return BinanceUserDataCredentialsResolution(
            api_key_env_var=key_env_var,
            api_secret_env_var=secret_env_var,
            state="configured",
            api_key=api_key,
            api_secret=api_secret,
        )
    if api_key or api_secret or key_env_var or secret_env_var:
        return BinanceUserDataCredentialsResolution(
            api_key_env_var=key_env_var,
            api_secret_env_var=secret_env_var,
            state="partial",
            api_key=api_key,
            api_secret=api_secret,
        )
    return BinanceUserDataCredentialsResolution(
        api_key_env_var=None,
        api_secret_env_var=None,
        state="missing",
        api_key=None,
        api_secret=None,
    )
