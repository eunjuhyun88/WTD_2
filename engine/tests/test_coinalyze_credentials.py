from __future__ import annotations

from data_cache.coinalyze_credentials import resolve_coinalyze_api_key


def test_resolve_coinalyze_api_key_uses_primary_alias(monkeypatch) -> None:
    monkeypatch.setenv("COINALYZE_API_KEY", "live-key-123")
    resolution = resolve_coinalyze_api_key()
    assert resolution.state == "configured"
    assert resolution.env_var == "COINALYZE_API_KEY"
    assert resolution.value == "live-key-123"


def test_resolve_coinalyze_api_key_detects_placeholder(monkeypatch) -> None:
    monkeypatch.setenv("COINALYZE_API_KEY", "your_placeholder_key")
    resolution = resolve_coinalyze_api_key()
    assert resolution.state == "placeholder"
    assert resolution.env_var == "COINALYZE_API_KEY"
    assert resolution.value is None


def test_resolve_coinalyze_api_key_uses_alias_when_primary_missing(monkeypatch) -> None:
    monkeypatch.delenv("COINALYZE_API_KEY", raising=False)
    monkeypatch.setenv("COINALYZE_KEY", "alt-live-key")
    resolution = resolve_coinalyze_api_key()
    assert resolution.state == "configured"
    assert resolution.env_var == "COINALYZE_KEY"
    assert resolution.value == "alt-live-key"
