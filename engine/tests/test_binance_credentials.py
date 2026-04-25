from __future__ import annotations

from data_cache.binance_credentials import resolve_binance_api_key


def test_resolve_binance_api_key_uses_primary_alias(monkeypatch) -> None:
    monkeypatch.setenv("BINANCE_API_KEY", "live-key-123")
    resolution = resolve_binance_api_key()
    assert resolution.state == "configured"
    assert resolution.env_var == "BINANCE_API_KEY"
    assert resolution.value == "live-key-123"


def test_resolve_binance_api_key_detects_placeholder(monkeypatch) -> None:
    monkeypatch.setenv("BINANCE_FAPI_API_KEY", "your_placeholder_key")
    resolution = resolve_binance_api_key()
    assert resolution.state == "placeholder"
    assert resolution.env_var == "BINANCE_FAPI_API_KEY"
    assert resolution.value is None


def test_resolve_binance_api_key_uses_alias_when_primary_missing(monkeypatch) -> None:
    monkeypatch.delenv("BINANCE_API_KEY", raising=False)
    monkeypatch.setenv("BINANCE_FUTURES_API_KEY", "alt-live-key")
    resolution = resolve_binance_api_key()
    assert resolution.state == "configured"
    assert resolution.env_var == "BINANCE_FUTURES_API_KEY"
    assert resolution.value == "alt-live-key"
