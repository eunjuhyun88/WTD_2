from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import captures
from capture.store import CaptureStore
from capture.types import CaptureRecord
from ledger.store import LedgerStore
from ledger.types import PatternOutcome
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


def _client_with_ledger(tmp_path, monkeypatch) -> TestClient:
    capture_store = CaptureStore(tmp_path / "capture.sqlite")
    state_store = PatternStateStore(tmp_path / "runtime.sqlite")
    ledger_store = LedgerStore(tmp_path / "ledger")
    verdict_records: list = []
    capture_records: list = []

    class FakeRecordStore:
        def append_capture_record(self, record):
            capture_records.append(record)

        def append_verdict_record(self, outcome):
            verdict_records.append(outcome)

    monkeypatch.setattr(captures, "_capture_store", capture_store)
    monkeypatch.setattr(captures, "_state_store", state_store)
    monkeypatch.setattr(captures, "_ledger_store", ledger_store)
    monkeypatch.setattr(captures, "LEDGER_RECORD_STORE", FakeRecordStore())
    app = FastAPI()
    app.include_router(captures.router, prefix="/captures")
    client = TestClient(app)
    client.capture_store = capture_store  # type: ignore[attr-defined]
    client.ledger_store = ledger_store  # type: ignore[attr-defined]
    client.verdict_records = verdict_records  # type: ignore[attr-defined]
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


def test_manual_hypothesis_capture_is_pending_outcome(tmp_path, monkeypatch) -> None:
    """manual_hypothesis must enter the resolver pipeline (cold-start lane)."""
    client = _client(tmp_path, monkeypatch)

    response = client.post(
        "/captures",
        json={
            "capture_kind": "manual_hypothesis",
            "user_id": "founder",
            "symbol": "SOLUSDT",
            "timeframe": "1h",
            "user_note": "H1 hypothesis",
        },
    )

    assert response.status_code == 200
    capture = response.json()["capture"]
    assert capture["capture_kind"] == "manual_hypothesis"
    assert capture["status"] == "pending_outcome"


def test_manual_hypothesis_capture_persists_research_context(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    response = client.post(
        "/captures",
        json={
            "capture_kind": "manual_hypothesis",
            "user_id": "founder",
            "symbol": "TRADOORUSDT",
            "timeframe": "15m",
            "user_note": "telegram seed",
            "research_context": {
                "pattern_family": "tradoor_ptb_oi_reversal",
                "research_tags": ["second_dump", "oi_reexpand"],
                "phase_annotations": [
                    {
                        "phase_id": "real_dump",
                        "label": "second dump",
                        "timeframe": "15m",
                        "signals_required": ["price_dump", "oi_spike_with_dump"],
                    }
                ],
            },
        },
    )

    assert response.status_code == 200
    capture = response.json()["capture"]
    assert capture["research_context"]["pattern_family"] == "tradoor_ptb_oi_reversal"
    stored = client.capture_store.load(capture["capture_id"])  # type: ignore[attr-defined]
    assert stored is not None
    assert stored.research_context["research_tags"] == ["second_dump", "oi_reexpand"]


def test_chart_bookmark_capture_is_closed(tmp_path, monkeypatch) -> None:
    """chart_bookmark captures have no outcome to compute — terminal on write."""
    client = _client(tmp_path, monkeypatch)

    response = client.post(
        "/captures",
        json={
            "capture_kind": "chart_bookmark",
            "user_id": "user-1",
            "symbol": "BTCUSDT",
            "timeframe": "4h",
        },
    )

    assert response.status_code == 200
    assert response.json()["capture"]["status"] == "closed"


def test_bulk_import_creates_pending_outcome_manual_hypotheses(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    response = client.post(
        "/captures/bulk_import",
        json={
            "user_id": "founder",
            "rows": [
                {
                    "symbol": "BTCUSDT",
                    "timeframe": "1h",
                    "captured_at_ms": 1770000000000,
                    "pattern_slug": "tradoor-oi-reversal-v1",
                    "phase": "ACCUMULATION",
                    "user_note": "H1",
                    "entry_price": 60000.0,
                },
                {
                    "symbol": "ETHUSDT",
                    "timeframe": "1h",
                    "captured_at_ms": 1770003600000,
                    "user_note": "H2",
                    "research_context": {
                        "pattern_family": "tradoor_ptb_oi_reversal",
                        "thesis": ["second dump is the real event"],
                    },
                },
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    assert len(payload["capture_ids"]) == 2

    rows = client.capture_store.list(  # type: ignore[attr-defined]
        user_id="founder", status="pending_outcome"
    )
    assert len(rows) == 2
    assert {r.symbol for r in rows} == {"BTCUSDT", "ETHUSDT"}
    assert all(r.capture_kind == "manual_hypothesis" for r in rows)
    btc = next(r for r in rows if r.symbol == "BTCUSDT")
    assert btc.chart_context["hypothetical_entry_price"] == 60000.0
    eth = next(r for r in rows if r.symbol == "ETHUSDT")
    assert eth.research_context["thesis"] == ["second dump is the real event"]


def test_bulk_import_rejects_empty_rows(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    response = client.post(
        "/captures/bulk_import",
        json={"user_id": "founder", "rows": []},
    )

    assert response.status_code == 422  # pydantic min_length violation


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


# ---------------------------------------------------------------------------
# Phase C: verdict labeling (axis 3 close)
# ---------------------------------------------------------------------------


def _outcome_ready_capture(capture_store: CaptureStore, ledger_store: LedgerStore) -> CaptureRecord:
    outcome = PatternOutcome(
        id="out-1",
        pattern_slug="tradoor-oi-reversal-v1",
        symbol="BTCUSDT",
        outcome="success",
    )
    ledger_store.save(outcome)

    capture = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="BTCUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        timeframe="1h",
        captured_at_ms=1770000000000,
        outcome_id="out-1",
        status="outcome_ready",
    )
    capture_store.save(capture)
    return capture


def test_label_verdict_happy_path(tmp_path, monkeypatch) -> None:
    client = _client_with_ledger(tmp_path, monkeypatch)
    capture = _outcome_ready_capture(
        client.capture_store,  # type: ignore[attr-defined]
        client.ledger_store,  # type: ignore[attr-defined]
    )

    response = client.post(
        f"/captures/{capture.capture_id}/verdict",
        json={"verdict": "valid", "user_note": "clean entry"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["user_verdict"] == "valid"
    assert payload["outcome_id"] == "out-1"

    reloaded = client.capture_store.load(capture.capture_id)  # type: ignore[attr-defined]
    assert reloaded.status == "verdict_ready"
    assert reloaded.verdict_id == "out-1"

    updated = client.ledger_store.load("tradoor-oi-reversal-v1", "out-1")  # type: ignore[attr-defined]
    assert updated.user_verdict == "valid"
    assert updated.user_note == "clean entry"

    assert len(client.verdict_records) == 1  # type: ignore[attr-defined]


def test_label_verdict_rejects_pending_capture(tmp_path, monkeypatch) -> None:
    client = _client_with_ledger(tmp_path, monkeypatch)
    capture = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="BTCUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        timeframe="1h",
        captured_at_ms=1770000000000,
        status="pending_outcome",
    )
    client.capture_store.save(capture)  # type: ignore[attr-defined]

    response = client.post(
        f"/captures/{capture.capture_id}/verdict",
        json={"verdict": "valid"},
    )
    assert response.status_code == 409


def test_label_verdict_capture_not_found(tmp_path, monkeypatch) -> None:
    client = _client_with_ledger(tmp_path, monkeypatch)
    response = client.post("/captures/no-such-id/verdict", json={"verdict": "valid"})
    assert response.status_code == 404


def test_label_verdict_no_outcome_id_returns_409(tmp_path, monkeypatch) -> None:
    client = _client_with_ledger(tmp_path, monkeypatch)
    capture = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="BTCUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        timeframe="1h",
        captured_at_ms=1770000000000,
        outcome_id=None,
        status="outcome_ready",
    )
    client.capture_store.save(capture)  # type: ignore[attr-defined]

    response = client.post(
        f"/captures/{capture.capture_id}/verdict",
        json={"verdict": "valid"},
    )
    assert response.status_code == 409
