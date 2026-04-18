"""Tests for /observability/flywheel/health.

Covers the pure-function shape (compute_flywheel_health) as well as the
FastAPI wiring. Uses a monkey-patched CaptureStore, LedgerRecordStore,
and PATTERN_LIBRARY so each test owns its data.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import observability
from capture.store import CaptureStore
from capture.types import CaptureRecord
from ledger.store import LedgerRecordStore
from ledger.types import PatternLedgerRecord


@pytest.fixture
def wire(tmp_path, monkeypatch):
    capture_store = CaptureStore(tmp_path / "capture.sqlite")
    record_store = LedgerRecordStore(base_dir=tmp_path / "ledger_records")

    monkeypatch.setattr(observability, "_capture_store", capture_store)
    monkeypatch.setattr(observability, "LEDGER_RECORD_STORE", record_store)

    # Minimal pattern library + empty model registry so active_models_per_pattern
    # is deterministic regardless of host state.
    monkeypatch.setattr(observability, "PATTERN_LIBRARY", {"tradoor-oi-reversal-v1": None})

    class EmptyRegistry:
        def get_active(self, slug):  # noqa: ARG002
            return None

    monkeypatch.setattr(observability, "_model_registry", EmptyRegistry())
    return capture_store, record_store


def _capture(capture_id: str, status: str = "pending_outcome") -> CaptureRecord:
    return CaptureRecord(
        capture_id=capture_id,
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="BTCUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        timeframe="1h",
        captured_at_ms=1770000000000,
        status=status,
    )


def _record(
    record_type: str,
    pattern_slug: str = "tradoor-oi-reversal-v1",
    *,
    created_at: datetime | None = None,
    payload: dict | None = None,
) -> PatternLedgerRecord:
    return PatternLedgerRecord(
        record_type=record_type,
        pattern_slug=pattern_slug,
        created_at=created_at or datetime.now(),
        payload=payload or {},
    )


def test_empty_state_returns_zeros(wire) -> None:
    health = observability.compute_flywheel_health()
    assert health == {
        "captures_per_day_7d": 0.0,
        "captures_to_outcome_rate": 0.0,
        "outcomes_to_verdict_rate": 0.0,
        "verdicts_to_refinement_count_7d": 0,
        "active_models_per_pattern": {"tradoor-oi-reversal-v1": 0},
        "promotion_gate_pass_rate_30d": 0.0,
    }


def test_captures_per_day_counts_last_7d_only(wire) -> None:
    _, record_store = wire
    now = datetime(2026, 4, 18, 12, 0)

    # 14 captures in the last 7 days → 2.0 per day.
    for i in range(14):
        record_store.append(_record("capture", created_at=now - timedelta(days=i % 7)))
    # One ancient capture → excluded.
    record_store.append(_record("capture", created_at=now - timedelta(days=30)))

    health = observability.compute_flywheel_health(now=now)
    assert health["captures_per_day_7d"] == 2.0


def test_captures_to_outcome_rate_uses_capture_status(wire) -> None:
    capture_store, _ = wire
    # 3 pending + 2 outcome_ready → 2/5 = 0.4
    for i in range(3):
        capture_store.save(_capture(f"cap-pending-{i}", status="pending_outcome"))
    for i in range(2):
        capture_store.save(_capture(f"cap-ready-{i}", status="outcome_ready"))

    health = observability.compute_flywheel_health()
    assert health["captures_to_outcome_rate"] == 0.4


def test_outcomes_to_verdict_rate(wire) -> None:
    _, record_store = wire
    now = datetime.now()
    for i in range(10):
        record_store.append(_record("outcome", created_at=now))
    for i in range(3):
        record_store.append(_record("verdict", created_at=now))

    health = observability.compute_flywheel_health(now=now)
    assert health["outcomes_to_verdict_rate"] == 0.3


def test_refinement_count_7d(wire) -> None:
    _, record_store = wire
    now = datetime(2026, 4, 18, 12, 0)
    for i in range(4):
        record_store.append(_record("training_run", created_at=now - timedelta(days=i)))
    # Stale run outside window
    record_store.append(_record("training_run", created_at=now - timedelta(days=14)))

    health = observability.compute_flywheel_health(now=now)
    assert health["verdicts_to_refinement_count_7d"] == 4


def test_active_models_reflects_registry(wire, monkeypatch) -> None:
    class OneActive:
        def get_active(self, slug):
            return object() if slug == "tradoor-oi-reversal-v1" else None

    monkeypatch.setattr(observability, "_model_registry", OneActive())
    health = observability.compute_flywheel_health()
    assert health["active_models_per_pattern"] == {"tradoor-oi-reversal-v1": 1}


def test_promotion_gate_pass_rate_30d(wire) -> None:
    _, record_store = wire
    now = datetime(2026, 4, 18, 12, 0)
    # 5 training runs, 2 model promotions → 0.4 pass rate
    for i in range(5):
        record_store.append(_record("training_run", created_at=now - timedelta(days=i)))
    for i in range(2):
        record_store.append(_record("model", created_at=now - timedelta(days=i)))

    health = observability.compute_flywheel_health(now=now)
    assert health["promotion_gate_pass_rate_30d"] == 0.4


def test_route_returns_ok_envelope(wire) -> None:
    app = FastAPI()
    app.include_router(observability.router, prefix="/observability")
    client = TestClient(app)
    response = client.get("/observability/flywheel/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert "captures_per_day_7d" in payload
    assert "captures_to_outcome_rate" in payload
    assert "active_models_per_pattern" in payload
