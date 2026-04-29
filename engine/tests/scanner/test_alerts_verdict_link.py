"""Tests for F-3 verdict deep-link URL generation in alerts."""
import pytest
from unittest.mock import Mock, patch, AsyncMock

from scanner._verdict_link import build_verdict_url


class TestBuildVerdictUrl:
    """Tests for verdict URL generation."""

    def test_returns_none_if_symbol_missing(self):
        """Missing symbol → no URL."""
        result = build_verdict_url(symbol=None, pattern_slug="test-pattern")
        assert result is None

    def test_returns_none_if_pattern_slug_missing(self):
        """Missing pattern_slug → no URL."""
        result = build_verdict_url(symbol="BTCUSDT", pattern_slug=None)
        assert result is None

    def test_returns_none_if_capture_not_found(self):
        """No pending capture → no URL."""
        with patch("scanner._verdict_link._CAPTURE_STORE") as mock_store:
            mock_store.list.return_value = []
            result = build_verdict_url(symbol="BTCUSDT", pattern_slug="test-pattern")
            assert result is None

    def test_returns_none_if_token_generation_fails(self):
        """Token generation failure → graceful degrade."""
        mock_capture = Mock()
        mock_capture.capture_id = "cap-123"
        mock_capture.candidate_transition_id = None

        with patch("scanner._verdict_link._CAPTURE_STORE") as mock_store:
            mock_store.list.return_value = [mock_capture]
            with patch("scanner._verdict_link.sign_verdict_token", return_value=None):
                result = build_verdict_url(symbol="BTCUSDT", pattern_slug="test-pattern")
                assert result is None

    def test_returns_url_with_valid_capture(self):
        """Valid capture + token → returns full URL."""
        mock_capture = Mock()
        mock_capture.capture_id = "cap-123"
        mock_capture.candidate_transition_id = None

        with patch("scanner._verdict_link._CAPTURE_STORE") as mock_store:
            mock_store.list.return_value = [mock_capture]
            with patch("scanner._verdict_link.sign_verdict_token", return_value="token.sig"):
                with patch("scanner._verdict_link.verdict_deeplink_url", return_value="https://cogochi.app/verdict?token=token.sig"):
                    result = build_verdict_url(symbol="BTCUSDT", pattern_slug="test-pattern")
                    assert result == "https://cogochi.app/verdict?token=token.sig"

    def test_prefers_capture_by_transition_id(self):
        """When transition_id is present, prefer matching capture."""
        mock_capture1 = Mock()
        mock_capture1.capture_id = "cap-1"
        mock_capture1.candidate_transition_id = "trans-1"

        mock_capture2 = Mock()
        mock_capture2.capture_id = "cap-2"
        mock_capture2.candidate_transition_id = "trans-2"

        with patch("scanner._verdict_link._CAPTURE_STORE") as mock_store:
            mock_store.list.return_value = [mock_capture1, mock_capture2]
            with patch("scanner._verdict_link.sign_verdict_token") as mock_sign:
                with patch("scanner._verdict_link.verdict_deeplink_url", return_value="https://..."):
                    build_verdict_url(
                        symbol="BTCUSDT",
                        pattern_slug="test-pattern",
                        transition_id="trans-2",
                    )
                    # Should call sign_verdict_token with cap-2
                    mock_sign.assert_called_once()
                    assert mock_sign.call_args[0][0] == "cap-2"

    def test_fallback_to_first_capture_if_no_transition_match(self):
        """If transition_id doesn't match any capture, use first one."""
        mock_capture = Mock()
        mock_capture.capture_id = "cap-1"
        mock_capture.candidate_transition_id = "trans-1"

        with patch("scanner._verdict_link._CAPTURE_STORE") as mock_store:
            mock_store.list.return_value = [mock_capture]
            with patch("scanner._verdict_link.sign_verdict_token") as mock_sign:
                with patch("scanner._verdict_link.verdict_deeplink_url", return_value="https://..."):
                    build_verdict_url(
                        symbol="BTCUSDT",
                        pattern_slug="test-pattern",
                        transition_id="trans-nonexistent",
                    )
                    # Should still call sign with first capture
                    mock_sign.assert_called_once()
                    assert mock_sign.call_args[0][0] == "cap-1"

    def test_exception_during_capture_lookup_degrades_gracefully(self):
        """Exception during store lookup → no URL."""
        with patch("scanner._verdict_link._CAPTURE_STORE") as mock_store:
            mock_store.list.side_effect = Exception("DB connection failed")
            result = build_verdict_url(symbol="BTCUSDT", pattern_slug="test-pattern")
            assert result is None
