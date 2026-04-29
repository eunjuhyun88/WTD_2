"""Verdict deep-link URL generation — shared helper for alerts.py + alerts_pattern.py."""
from __future__ import annotations

import logging
from typing import Any, Optional

from capture.store import CaptureStore
from capture.token import sign_verdict_token, verdict_deeplink_url

log = logging.getLogger("engine.scanner._verdict_link")

_CAPTURE_STORE = CaptureStore()


def build_verdict_url(
    symbol: str,
    pattern_slug: Optional[str] = None,
    transition_id: Optional[str] = None,
    candidate_transition_id: Optional[str] = None,
) -> Optional[str]:
    """Build a signed verdict deep-link URL for a pattern alert or signal.

    Looks up the capture for this symbol/pattern combination and returns a
    signed token with 72h TTL. Returns None if:
    - Capture not found
    - VERDICT_LINK_SECRET not configured

    Any failure degrades gracefully — caller sends alert without URL.
    """
    if not symbol or not pattern_slug:
        return None

    try:
        # Find the most recent pending_outcome capture matching symbol + pattern
        captures = _CAPTURE_STORE.list(
            symbol=symbol,
            pattern_slug=pattern_slug,
            status="pending_outcome",
            limit=5,
        )

        # Prefer the one whose candidate_transition_id/transition_id matches
        capture = None
        if transition_id or candidate_transition_id:
            target_id = transition_id or candidate_transition_id
            for c in captures:
                if c.candidate_transition_id == target_id:
                    capture = c
                    break

        if capture is None and captures:
            capture = captures[0]  # fall back to most recent

        if capture is None:
            log.debug("No pending capture found for %s %s — verdict URL skipped", symbol, pattern_slug)
            return None

        token = sign_verdict_token(capture.capture_id, symbol, pattern_slug)
        if not token:
            return None

        return verdict_deeplink_url(token)

    except Exception as exc:
        log.debug("verdict URL generation failed for %s %s: %s", symbol, pattern_slug, exc)
        return None
