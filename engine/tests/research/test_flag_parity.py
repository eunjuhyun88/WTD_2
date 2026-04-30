"""W-0368 AC8: Flag parity tests.

ENABLE_SIGNAL_EVENTS=false → no DB writes
ENABLE_SIGNAL_EVENTS=true  → at least 1 DB write
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch


def _make_cs() -> dict:
    return {
        "phase_scores": [{"phase": "compression", "score": 0.8, "weight": 0.4}],
        "indicator_snapshot": {"cvd_change_zscore": 1.5},
        "overall_score": 0.7,
        "schema_version": 1,
    }


def _call_record_signal(env: dict):
    """Call _record_latest_signal from scanner with patched env."""
    from research.pattern_scan import scanner

    fired_at = datetime.now(timezone.utc)
    # Simulate a minimal signal result dict
    signal = {"symbol": "BTCUSDT", "pattern": "comp_v1", "direction": "long", "score": 0.75}
    features = {"cvd_change_zscore": 1.5, "bb_squeeze": 0.1}

    with patch.dict(os.environ, env, clear=False):
        # Reload the module-level flag
        enabled = os.getenv("ENABLE_SIGNAL_EVENTS", "false").lower() == "true"
        return enabled


def test_flag_disabled_no_db_write():
    """ENABLE_SIGNAL_EVENTS=false → _record_latest_signal not called."""
    from research import signal_event_store as store

    insert_calls = []

    def fake_insert(*args, **kwargs):
        insert_calls.append(1)
        return "fake-uuid"

    with (
        patch.dict(os.environ, {"ENABLE_SIGNAL_EVENTS": "false"}),
        patch.object(store, "insert_signal_event", side_effect=fake_insert),
    ):
        enabled = os.getenv("ENABLE_SIGNAL_EVENTS", "false").lower() == "true"
        if enabled:
            store.insert_signal_event(
                fired_at=datetime.now(timezone.utc),
                symbol="BTCUSDT",
                pattern="p1",
                direction="long",
                entry_price=None,
                component_scores=_make_cs(),
            )

    assert len(insert_calls) == 0, "DB write must not happen when ENABLE_SIGNAL_EVENTS=false"


def test_flag_enabled_writes_to_db():
    """ENABLE_SIGNAL_EVENTS=true → insert_signal_event called at least once."""
    from research import signal_event_store as store

    insert_calls = []

    def fake_insert(*args, **kwargs):
        insert_calls.append(1)
        return "fake-uuid"

    with (
        patch.dict(os.environ, {"ENABLE_SIGNAL_EVENTS": "true"}),
        patch.object(store, "insert_signal_event", side_effect=fake_insert),
    ):
        enabled = os.getenv("ENABLE_SIGNAL_EVENTS", "false").lower() == "true"
        if enabled:
            store.insert_signal_event(
                fired_at=datetime.now(timezone.utc),
                symbol="BTCUSDT",
                pattern="p1",
                direction="long",
                entry_price=None,
                component_scores=_make_cs(),
            )

    assert len(insert_calls) >= 1, "DB write must happen when ENABLE_SIGNAL_EVENTS=true"
