"""F-3 Verdict deep-link tests.

Covers:
- sign_verdict_token: signing, None when secret missing, URL format
- _build_verdict_url: graceful degrade paths
- send_pattern_entry_alert: URL appears in Telegram payload when capture exists
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from capture.token import sign_verdict_token, verdict_deeplink_url


# ---------------------------------------------------------------------------
# sign_verdict_token
# ---------------------------------------------------------------------------

class TestSignVerdictToken:
    def test_returns_none_without_secret(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("VERDICT_LINK_SECRET", None)
            token = sign_verdict_token("cap-1", "BTCUSDT", "accumulation")
        assert token is None

    def test_returns_token_with_secret(self):
        with patch.dict(os.environ, {"VERDICT_LINK_SECRET": "testsecret"}):
            token = sign_verdict_token("cap-1", "BTCUSDT", "accumulation")
        assert token is not None
        assert "." in token

    def test_token_payload_decodable(self):
        with patch.dict(os.environ, {"VERDICT_LINK_SECRET": "testsecret"}):
            token = sign_verdict_token("cap-1", "BTCUSDT", "accumulation")
        payload_b64, sig = token.rsplit(".", 1)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=="))
        assert payload["capture_id"] == "cap-1"
        assert payload["symbol"] == "BTCUSDT"
        assert payload["pattern_slug"] == "accumulation"
        assert payload["expires_at"] > int(time.time())

    def test_token_signature_valid(self):
        secret = "testsecret"
        with patch.dict(os.environ, {"VERDICT_LINK_SECRET": secret}):
            token = sign_verdict_token("cap-1", "BTCUSDT", "accumulation")
        payload_b64, sig = token.rsplit(".", 1)
        expected_sig = hmac.new(
            secret.encode(), payload_b64.encode(), hashlib.sha256
        ).hexdigest()
        assert sig == expected_sig


# ---------------------------------------------------------------------------
# verdict_deeplink_url
# ---------------------------------------------------------------------------

class TestVerdictDeeplinkUrl:
    def test_default_origin(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("APP_ORIGIN", None)
            url = verdict_deeplink_url("tok123")
        assert url == "https://cogochi.app/verdict?token=tok123"

    def test_custom_origin(self):
        with patch.dict(os.environ, {"APP_ORIGIN": "https://staging.cogochi.app"}):
            url = verdict_deeplink_url("tok123")
        assert url == "https://staging.cogochi.app/verdict?token=tok123"


# ---------------------------------------------------------------------------
# _build_verdict_url (integration with mocked CaptureStore)
# ---------------------------------------------------------------------------

class TestBuildVerdictUrl:
    def _make_record(self, **overrides) -> dict[str, Any]:
        base = {
            "symbol": "BTCUSDT",
            "slug": "accumulation",
            "pattern_slug": "accumulation",
            "transition_id": "tr-001",
        }
        base.update(overrides)
        return base

    def _make_capture(self, capture_id="cap-1", transition_id="tr-001"):
        cap = MagicMock()
        cap.capture_id = capture_id
        cap.candidate_transition_id = transition_id
        cap.symbol = "BTCUSDT"
        cap.pattern_slug = "accumulation"
        return cap

    def test_returns_url_when_capture_exists(self):
        record = self._make_record()
        cap = self._make_capture()

        with (
            patch("scanner._verdict_link._CAPTURE_STORE") as mock_store,
            patch.dict(os.environ, {
                "VERDICT_LINK_SECRET": "sec",
                "APP_ORIGIN": "https://cogochi.app",
            }),
        ):
            mock_store.list.return_value = [cap]
            from scanner._verdict_link import build_verdict_url
            url = build_verdict_url(
                symbol=record.get("symbol"),
                pattern_slug=record.get("slug"),
                transition_id=record.get("transition_id"),
            )

        assert url is not None
        assert "/verdict?token=" in url

    def test_returns_none_when_no_capture(self):
        record = self._make_record()
        with (
            patch("scanner._verdict_link._CAPTURE_STORE") as mock_store,
            patch.dict(os.environ, {"VERDICT_LINK_SECRET": "sec"}),
        ):
            mock_store.list.return_value = []
            from scanner._verdict_link import build_verdict_url
            url = build_verdict_url(
                symbol=record.get("symbol"),
                pattern_slug=record.get("slug"),
                transition_id=record.get("transition_id"),
            )
        assert url is None

    def test_returns_none_without_secret(self):
        record = self._make_record()
        cap = self._make_capture()
        with (
            patch("scanner._verdict_link._CAPTURE_STORE") as mock_store,
            patch.dict(os.environ, {}, clear=False),
        ):
            os.environ.pop("VERDICT_LINK_SECRET", None)
            mock_store.list.return_value = [cap]
            from scanner._verdict_link import build_verdict_url
            url = build_verdict_url(
                symbol=record.get("symbol"),
                pattern_slug=record.get("slug"),
                transition_id=record.get("transition_id"),
            )
        assert url is None

    def test_returns_none_when_symbol_missing(self):
        record = self._make_record(symbol=None)
        from scanner._verdict_link import build_verdict_url
        url = build_verdict_url(
            symbol=record.get("symbol"),
            pattern_slug=record.get("slug"),
        )
        assert url is None

    def test_prefers_matching_transition_id(self):
        """When multiple captures exist, prefer the one matching transition_id."""
        record = self._make_record(transition_id="tr-002")
        cap_wrong = self._make_capture(capture_id="cap-old", transition_id="tr-001")
        cap_right = self._make_capture(capture_id="cap-new", transition_id="tr-002")

        with (
            patch("scanner._verdict_link._CAPTURE_STORE") as mock_store,
            patch.dict(os.environ, {"VERDICT_LINK_SECRET": "sec"}),
        ):
            mock_store.list.return_value = [cap_right, cap_wrong]
            from scanner._verdict_link import build_verdict_url
            url = build_verdict_url(
                symbol=record.get("symbol"),
                pattern_slug=record.get("slug"),
                transition_id=record.get("transition_id"),
            )

        assert url is not None
        # decode token and verify capture_id
        token = url.split("token=")[1]
        payload_b64 = token.rsplit(".", 1)[0]
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=="))
        assert payload["capture_id"] == "cap-new"


# ---------------------------------------------------------------------------
# send_pattern_entry_alert: URL injection in Telegram payload (AC1)
# ---------------------------------------------------------------------------

class TestSendPatternEntryAlertUrl:
    def _make_record(self) -> dict[str, Any]:
        return {
            "symbol": "ETHUSDT",
            "slug": "accumulation",
            "pattern_slug": "accumulation",
            "transition_id": "tr-eth-001",
            "entry_p_win": None,
            "feature_snapshot": {"price": 3000.0, "regime": "bull"},
            "blocks_triggered": [],
            "bars_in_phase": 5,
            "phase_label": "ACCUMULATION",
            "confidence": 0.8,
        }

    def test_verdict_url_in_payload_when_capture_exists(self):
        import asyncio
        import httpx

        record = self._make_record()
        cap = MagicMock()
        cap.capture_id = "cap-eth-001"
        cap.candidate_transition_id = "tr-eth-001"

        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.status_code = 200

        with (
            patch("scanner._verdict_link._CAPTURE_STORE") as mock_store,
            patch.dict(os.environ, {
                "VERDICT_LINK_SECRET": "sec",
                "APP_ORIGIN": "https://cogochi.app",
                "TELEGRAM_BOT_TOKEN": "bot:token",
                "TELEGRAM_CHAT_ID": "12345",
            }),
            patch("scanner.alerts_pattern.get_client") as mock_client,
        ):
            mock_store.list.return_value = [cap]
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_resp)
            mock_client.return_value = mock_http

            from scanner.alerts_pattern import send_pattern_entry_alert
            result = asyncio.run(send_pattern_entry_alert(record))

        assert result is True
        call_kwargs = mock_http.post.call_args
        payload = call_kwargs[1]["json"] if call_kwargs[1] else call_kwargs.kwargs["json"]
        assert "/verdict?token=" in payload["text"]
        assert "📊" in payload["text"]

    def test_alert_sent_without_url_when_no_capture(self):
        """AC4: graceful degrade — alert sent even without verdict URL."""
        import asyncio
        import httpx

        record = self._make_record()

        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.status_code = 200

        with (
            patch("scanner._verdict_link._CAPTURE_STORE") as mock_store,
            patch.dict(os.environ, {
                "VERDICT_LINK_SECRET": "sec",
                "TELEGRAM_BOT_TOKEN": "bot:token",
                "TELEGRAM_CHAT_ID": "12345",
            }),
            patch("scanner.alerts_pattern.get_client") as mock_client,
        ):
            mock_store.list.return_value = []
            mock_http = AsyncMock()
            mock_http.post = AsyncMock(return_value=mock_resp)
            mock_client.return_value = mock_http

            from scanner.alerts_pattern import send_pattern_entry_alert
            result = asyncio.run(send_pattern_entry_alert(record))

        assert result is True
        call_kwargs = mock_http.post.call_args
        payload = call_kwargs[1]["json"] if call_kwargs[1] else call_kwargs.kwargs["json"]
        assert "/verdict?token=" not in payload["text"]
