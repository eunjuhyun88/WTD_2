from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import captures
from capture.store import CaptureStore
from patterns.state_store import PatternStateStore
from patterns.types import PhaseTransition


def _client(tmp_path, monkeypatch) -> TestClient:
    capture_store = CaptureStore(tmp_path / "capture.sqlite")
    state_store = PatternStateStore(tmp_path / "runtime.sqlite")
    appended = []

    class FakeRecordStore:
        def append_capture_record(self, record):
            appended.append(record)
            return None

    monkeypatch.setattr(captures, "_capture_store", capture_store)
    monkeypatch.setattr(captures, "_state_store", state_store)
    monkeypatch.setattr(captures, "LEDGER_RECORD_STORE", FakeRecordStore())
    app = FastAPI()
    app.include_router(captures.router, prefix="/captures")
    client = TestClient(app)
    client.capture_store = capture_store  # type: ignore[attr-defined]
    client.state_store = state_store  # type: ignore[attr-defined]
    client.appended_records = appended  # type: ignore[attr-defined]
    return client


def _persist_transition(state_store: PatternStateStore) -> PhaseTransition:
    ts = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)
    transition = PhaseTransition(
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        pattern_version=1,
        timeframe="1h",
        from_phase="REAL_DUMP",
        to_phase="ACCUMULATION",
        from_phase_idx=2,
        to_phase_idx=3,
        timestamp=ts,
        scan_id="scan-1",
        is_entry_signal=True,
        feature_snapshot={"oi_change_1h": 0.18},
        block_scores={"funding_flip": {"passed": True, "score": 1.0}},
    )
    state_store.append_transition(transition)
    return transition


def test_create_pattern_candidate_capture_requires_transition_id(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    response = client.post(
        "/captures",
        json={
            "symbol": "PTBUSDT",
            "pattern_slug": "tradoor-oi-reversal-v1",
            "phase": "ACCUMULATION",
            "timeframe": "1h",
        },
    )

    assert response.status_code == 400
    assert "candidate_transition_id" in response.json()["detail"]


def test_create_pattern_candidate_capture_with_transition(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    transition = _persist_transition(client.state_store)  # type: ignore[arg-type, attr-defined]

    response = client.post(
        "/captures",
        json={
            "user_id": "user-1",
            "symbol": "PTBUSDT",
            "pattern_slug": "tradoor-oi-reversal-v1",
            "pattern_version": 1,
            "phase": "ACCUMULATION",
            "timeframe": "1h",
            "candidate_transition_id": transition.transition_id,
            "user_note": "clean",
            "chart_context": {"close": 1.23},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    capture = payload["capture"]
    assert payload["ok"] is True
    assert capture["candidate_transition_id"] == transition.transition_id
    assert capture["scan_id"] == "scan-1"
    assert capture["feature_snapshot"] == {"oi_change_1h": 0.18}
    assert capture["block_scores"]["funding_flip"]["passed"] is True
    assert capture["status"] == "pending_outcome"
    assert len(client.appended_records) == 1  # type: ignore[attr-defined]
    assert client.appended_records[0].capture_id == capture["capture_id"]  # type: ignore[attr-defined]

    get_response = client.get(f"/captures/{capture['capture_id']}")
    assert get_response.status_code == 200
    assert get_response.json()["capture"]["capture_id"] == capture["capture_id"]


def test_create_capture_rejects_transition_context_mismatch(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    transition = _persist_transition(client.state_store)  # type: ignore[arg-type, attr-defined]

    response = client.post(
        "/captures",
        json={
            "symbol": "BTCUSDT",
            "pattern_slug": "tradoor-oi-reversal-v1",
            "pattern_version": 1,
            "phase": "ACCUMULATION",
            "timeframe": "1h",
            "candidate_transition_id": transition.transition_id,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"]["message"] == "Capture context does not match referenced transition"
