"""Unit tests for engine/observability/sentry.py — graceful no-op + PII filter."""
from __future__ import annotations

import importlib
import sys
from typing import Any
from unittest.mock import MagicMock, patch

import pytest


def _reload_module():
    """Reload sentry module to reset _initialized global."""
    import observability.sentry as m
    importlib.reload(m)
    return m


# ── no-op behaviour ────────────────────────────────────────────────────────────

class TestInitSentryNoOp:
    def test_no_dsn_returns_silently(self, monkeypatch):
        monkeypatch.delenv("SENTRY_DSN", raising=False)
        m = _reload_module()
        m.init_sentry()
        assert not m._initialized

    def test_empty_dsn_returns_silently(self, monkeypatch):
        monkeypatch.setenv("SENTRY_DSN", "   ")
        m = _reload_module()
        m.init_sentry()
        assert not m._initialized

    def test_capture_exception_noop_when_not_initialized(self, monkeypatch):
        monkeypatch.delenv("SENTRY_DSN", raising=False)
        m = _reload_module()
        m.capture_exception(ValueError("boom"))  # must not raise

    def test_set_user_noop_when_not_initialized(self, monkeypatch):
        monkeypatch.delenv("SENTRY_DSN", raising=False)
        m = _reload_module()
        m.set_user("0xABCD")  # must not raise


# ── init with DSN ──────────────────────────────────────────────────────────────

class TestInitSentryWithDsn:
    def test_calls_sentry_sdk_init(self, monkeypatch):
        monkeypatch.setenv("SENTRY_DSN", "https://key@sentry.io/123")
        monkeypatch.setenv("SENTRY_ENVIRONMENT", "test")
        monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "0.05")

        mock_sdk = MagicMock()
        mock_sdk.init = MagicMock()
        with patch.dict(sys.modules, {"sentry_sdk": mock_sdk,
                                       "sentry_sdk.integrations.fastapi": MagicMock(),
                                       "sentry_sdk.integrations.starlette": MagicMock()}):
            m = _reload_module()
            m.init_sentry(release="v1.2.3")

        assert mock_sdk.init.called
        call_kwargs = mock_sdk.init.call_args.kwargs
        assert call_kwargs["dsn"] == "https://key@sentry.io/123"
        assert call_kwargs["environment"] == "test"
        assert call_kwargs["traces_sample_rate"] == pytest.approx(0.05)
        assert call_kwargs["release"] == "v1.2.3"
        assert call_kwargs["send_default_pii"] is False

    def test_sets_initialized_flag(self, monkeypatch):
        monkeypatch.setenv("SENTRY_DSN", "https://key@sentry.io/123")
        mock_sdk = MagicMock()
        with patch.dict(sys.modules, {"sentry_sdk": mock_sdk,
                                       "sentry_sdk.integrations.fastapi": MagicMock(),
                                       "sentry_sdk.integrations.starlette": MagicMock()}):
            m = _reload_module()
            m.init_sentry()
        assert m._initialized

    def test_import_error_disables_sentry(self, monkeypatch):
        monkeypatch.setenv("SENTRY_DSN", "https://key@sentry.io/123")
        # Simulate sentry_sdk not installed
        with patch.dict(sys.modules, {"sentry_sdk": None}):
            m = _reload_module()
            m.init_sentry()
        assert not m._initialized


# ── PII filter ─────────────────────────────────────────────────────────────────

class TestFilterPii:
    def _make_event(self, frame_vars: dict[str, Any]) -> dict[str, Any]:
        return {
            "exception": {
                "values": [{
                    "stacktrace": {
                        "frames": [{"vars": frame_vars}]
                    }
                }]
            }
        }

    @pytest.fixture(autouse=True)
    def _mod(self):
        import observability.sentry as m
        self.m = m

    @pytest.mark.parametrize("key", [
        "wallet_address", "user_email", "api_token", "secret_key",
        "password", "WALLET", "API_KEY",
    ])
    def test_sensitive_key_filtered(self, key):
        event = self._make_event({key: "sensitive-value"})
        result = self.m._filter_pii(event, {})
        frame = result["exception"]["values"][0]["stacktrace"]["frames"][0]
        assert frame["vars"][key] == "[Filtered]"

    def test_safe_key_preserved(self):
        event = self._make_event({"symbol": "BTCUSDT", "amount": 1000})
        result = self.m._filter_pii(event, {})
        frame = result["exception"]["values"][0]["stacktrace"]["frames"][0]
        assert frame["vars"]["symbol"] == "BTCUSDT"
        assert frame["vars"]["amount"] == 1000

    def test_empty_event_passes_through(self):
        result = self.m._filter_pii({}, {})
        assert result == {}

    def test_no_exception_key_passes_through(self):
        event = {"message": "plain error"}
        result = self.m._filter_pii(event, {})
        assert result["message"] == "plain error"

    def test_returns_event_not_none(self):
        """_filter_pii must always return the event (never None = drop)."""
        event = self._make_event({"wallet": "0xDEAD"})
        result = self.m._filter_pii(event, {})
        assert result is not None


# ── capture_exception + set_user when initialized ─────────────────────────────

class TestCaptureFunctions:
    def _init_with_mock(self, monkeypatch) -> tuple[Any, MagicMock]:
        monkeypatch.setenv("SENTRY_DSN", "https://key@sentry.io/123")
        mock_sdk = MagicMock()
        mock_sdk.new_scope.return_value.__enter__ = MagicMock(return_value=MagicMock())
        mock_sdk.new_scope.return_value.__exit__ = MagicMock(return_value=False)
        with patch.dict(sys.modules, {"sentry_sdk": mock_sdk,
                                       "sentry_sdk.integrations.fastapi": MagicMock(),
                                       "sentry_sdk.integrations.starlette": MagicMock()}):
            m = _reload_module()
            m.init_sentry()
        return m, mock_sdk

    def test_capture_exception_calls_sdk(self, monkeypatch):
        m, mock_sdk = self._init_with_mock(monkeypatch)
        exc = RuntimeError("test")
        with patch.dict(sys.modules, {"sentry_sdk": mock_sdk}):
            m.capture_exception(exc, agent="A001")
        assert mock_sdk.capture_exception.called or mock_sdk.new_scope.called

    def test_set_user_hashes_id(self, monkeypatch):
        m, mock_sdk = self._init_with_mock(monkeypatch)
        with patch.dict(sys.modules, {"sentry_sdk": mock_sdk}):
            m.set_user("0xWalletAddress123")
        mock_sdk.set_user.assert_called_once()
        call_arg = mock_sdk.set_user.call_args[0][0]
        assert "id" in call_arg
        assert "0xWalletAddress123" not in call_arg["id"]  # hashed, not raw
        assert len(call_arg["id"]) == 16  # first 16 hex chars
