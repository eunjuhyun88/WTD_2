"""W-0368: Hardening tests — retry FSM, DLQ, batch, circuit breaker."""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, call

import pytest


@pytest.fixture(autouse=True)
def reset_circuit_breaker():
    """Reset circuit breaker state before each test."""
    from research.signal_event_store import _cb
    _cb._state = "CLOSED"
    _cb._failures.clear()
    _cb._opened_at = None
    yield
    _cb._state = "CLOSED"
    _cb._failures.clear()
    _cb._opened_at = None


# ---------------------------------------------------------------------------
# AC2: Backoff values
# ---------------------------------------------------------------------------
def test_retry_backoff_values():
    from research.signal_event_store import get_retry_backoff
    assert get_retry_backoff(0) == 60
    assert get_retry_backoff(1) == 300
    assert get_retry_backoff(2) == 900


def test_retry_backoff_clamps_beyond_max():
    from research.signal_event_store import get_retry_backoff
    assert get_retry_backoff(99) == 900  # clamps to last value


# ---------------------------------------------------------------------------
# AC1: Retry FSM → DLQ after 3 failures
# ---------------------------------------------------------------------------
def test_retry_fsm_sends_to_dlq_after_3_attempts():
    """insert_signal_event retries 3 times then writes to DLQ."""
    from research import signal_event_store as store

    dlq_calls = []

    def fake_insert(row):
        raise RuntimeError("supabase down")

    def fake_dlq(data, error_msg, attempt_count=3):
        dlq_calls.append({"data": data, "error": error_msg, "attempts": attempt_count})

    fired_at = datetime.now(timezone.utc)
    component_scores = {
        "phase_scores": [{"phase": "compression", "score": 0.8, "weight": 0.4}],
        "indicator_snapshot": {"cvd_change_zscore": 1.5},
        "overall_score": 0.7,
        "schema_version": 1,
    }

    with (
        patch.object(store, "_do_insert", side_effect=fake_insert),
        patch.object(store, "insert_signal_event_dlq", side_effect=fake_dlq),
        patch.object(store, "time") as mock_time,
    ):
        mock_time.sleep = MagicMock()
        mock_time.monotonic = time.monotonic
        store.insert_signal_event(
            fired_at=fired_at,
            symbol="BTCUSDT",
            pattern="compression_v1",
            direction="long",
            entry_price=50000.0,
            component_scores=component_scores,
        )

    assert len(dlq_calls) == 1
    assert dlq_calls[0]["attempts"] == 3
    assert "supabase down" in dlq_calls[0]["error"]


# ---------------------------------------------------------------------------
# AC3: Circuit breaker OPEN → subsequent inserts go to DLQ
# ---------------------------------------------------------------------------
def test_circuit_breaker_opens_after_threshold():
    from research.signal_event_store import _cb
    # Record 10 failures within the window
    for _ in range(10):
        _cb.record_failure()
    assert _cb.state == "OPEN"


def test_circuit_breaker_open_sends_to_dlq():
    from research import signal_event_store as store
    from research.signal_event_store import _cb

    # Force OPEN
    for _ in range(10):
        _cb.record_failure()
    assert _cb.state == "OPEN"

    dlq_calls = []

    def fake_dlq(data, error_msg, attempt_count=3):
        dlq_calls.append(error_msg)

    fired_at = datetime.now(timezone.utc)
    component_scores = {
        "phase_scores": [{"phase": "compression", "score": 0.8, "weight": 0.4}],
        "indicator_snapshot": {"cvd_change_zscore": 1.5},
        "overall_score": 0.7,
        "schema_version": 1,
    }

    with patch.object(store, "insert_signal_event_dlq", side_effect=fake_dlq):
        store.insert_signal_event(
            fired_at=fired_at,
            symbol="ETHUSDT",
            pattern="expansion_v1",
            direction="long",
            entry_price=3000.0,
            component_scores=component_scores,
        )

    assert len(dlq_calls) == 1
    assert "circuit breaker" in dlq_calls[0]


# ---------------------------------------------------------------------------
# AC4: Circuit breaker HALF-OPEN → success → CLOSED
# ---------------------------------------------------------------------------
def test_circuit_breaker_recovers_after_open_duration():
    from research.signal_event_store import _cb
    import time

    # Force OPEN with backdated timestamp
    _cb._state = "OPEN"
    _cb._opened_at = time.monotonic() - (_cb.OPEN_DURATION_S + 10)

    # allow() should return True (HALF-OPEN probe)
    assert _cb.allow() is True
    assert _cb.state == "HALF-OPEN"

    # Simulate successful probe
    _cb.record_success()
    assert _cb.state == "CLOSED"


# ---------------------------------------------------------------------------
# AC5: Batch UPSERT — 100 events → single SQL call
# ---------------------------------------------------------------------------
def test_batch_flush_single_call():
    """100 events buffered → single Supabase insert call."""
    from research import signal_event_store as store
    from research.signal_event_store import _batch_buf, _flush_batch

    calls = []

    def fake_sb():
        m = MagicMock()
        m.table.return_value.insert.return_value.execute.side_effect = lambda: calls.append(1)
        return m

    # Build a batch of 100 rows
    rows = [{"symbol": f"TOK{i}USDT", "pattern": "v1", "fired_at": "2026-01-01T00:00:00Z"} for i in range(100)]
    with patch.object(store, "_sb", side_effect=fake_sb):
        _flush_batch(rows)

    assert len(calls) == 1  # single batch call, not 100 individual calls


# ---------------------------------------------------------------------------
# DLQ: insert_signal_event_dlq writes to DLQ table
# ---------------------------------------------------------------------------
def test_dlq_insert_called_on_failure():
    from research import signal_event_store as store

    dlq_data = []

    def fake_sb():
        m = MagicMock()
        m.table.return_value.insert.return_value.execute.side_effect = [
            RuntimeError("timeout"),  # attempt 0
            RuntimeError("timeout"),  # attempt 1
            RuntimeError("timeout"),  # attempt 2
        ]
        return m

    def capture_dlq(data, error_msg, attempt_count=3):
        dlq_data.append(data)

    fired_at = datetime.now(timezone.utc)
    cs = {
        "phase_scores": [{"phase": "x", "score": 0.5, "weight": 1.0}],
        "indicator_snapshot": {"cvd_change_zscore": 0.0},
        "overall_score": 0.5,
        "schema_version": 1,
    }

    with (
        patch.object(store, "_do_insert", side_effect=RuntimeError("timeout")),
        patch.object(store, "insert_signal_event_dlq", side_effect=capture_dlq),
        patch.object(store, "time") as mock_time,
    ):
        mock_time.sleep = MagicMock()
        mock_time.monotonic = time.monotonic
        store.insert_signal_event(
            fired_at=fired_at, symbol="XRPUSDT", pattern="p1",
            direction="long", entry_price=None, component_scores=cs,
        )

    assert len(dlq_data) == 1
    assert dlq_data[0]["symbol"] == "XRPUSDT"
