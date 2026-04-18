"""W-0088 Phase C — Verdict Inbox API tests.

Covers the two new endpoints added to close flywheel axis 3:
  * GET  /captures/outcomes            list captures awaiting verdict
  * POST /captures/{id}/verdict        apply user verdict, flip status

The verdict endpoint must:
  * write user_verdict + user_note to the linked PatternOutcome
  * append a LEDGER:verdict record
  * flip the capture status to verdict_ready + link verdict_id
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import captures as captures_module
from capture.store import CaptureStore
from capture.types import CaptureRecord
from ledger.store import LedgerStore
from ledger.types import PatternOutcome
from patterns.state_store import PatternStateStore


PATTERN_SLUG = "tradoor-oi-reversal-v1"


def _client(tmp_path, monkeypatch) -> TestClient:
    capture_store = CaptureStore(tmp_path / "capture.sqlite")
    ledger_store = LedgerStore(tmp_path / "ledger")
    state_store = PatternStateStore(tmp_path / "runtime.sqlite")

    verdict_records: list = []
    capture_records: list = []

    class FakeRecordStore:
        def append_capture_record(self, record):
            capture_records.append(record)

        def append_verdict_record(self, outcome):
            verdict_records.append(outcome)

        def append_outcome_record(self, outcome, previous_outcome=None):
            pass

    monkeypatch.setattr(captures_module, "_capture_store", capture_store)
    monkeypatch.setattr(captures_module, "_ledger_store", ledger_store)
    monkeypatch.setattr(captures_module, "_state_store", state_store)
    monkeypatch.setattr(captures_module, "LEDGER_RECORD_STORE", FakeRecordStore())

    app = FastAPI()
    app.include_router(captures_module.router, prefix="/captures")
    client = TestClient(app)
    client.capture_store = capture_store  # type: ignore[attr-defined]
    client.ledger_store = ledger_store  # type: ignore[attr-defined]
    client.verdict_records = verdict_records  # type: ignore[attr-defined]
    return client


def _seed_resolved_capture(
    *,
    capture_store: CaptureStore,
    ledger_store: LedgerStore,
    symbol: str = "BTCUSDT",
    outcome_label: str = "success",
    user_id: str = "founder",
    status: str = "outcome_ready",
) -> tuple[CaptureRecord, PatternOutcome]:
    """Create a matched (capture, outcome) pair in status='outcome_ready'."""
    outcome = PatternOutcome(
        pattern_slug=PATTERN_SLUG,
        symbol=symbol,
        user_id=user_id,
        outcome=outcome_label,  # type: ignore[arg-type]
        entry_price=100.0,
        peak_price=120.0,
        exit_price=115.0,
        max_gain_pct=0.20,
        exit_return_pct=0.15,
        accumulation_at=datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc),
        evaluation_window_hours=72.0,
    )
    ledger_store.save(outcome)
    capture = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id=user_id,
        symbol=symbol,
        pattern_slug=PATTERN_SLUG,
        pattern_version=1,
        phase="ACCUMULATION",
        timeframe="1h",
        captured_at_ms=1_713_000_000_000,
        outcome_id=outcome.id,
        status=status,  # type: ignore[arg-type]
    )
    capture_store.save(capture)
    return capture, outcome


# ── GET /captures/outcomes ──────────────────────────────────────────────────

def test_list_inbox_returns_outcome_ready_rows(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    capture, outcome = _seed_resolved_capture(
        capture_store=client.capture_store,  # type: ignore[attr-defined]
        ledger_store=client.ledger_store,  # type: ignore[attr-defined]
    )

    r = client.get("/captures/outcomes")

    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["status"] == "outcome_ready"
    assert body["count"] == 1
    item = body["items"][0]
    assert item["capture"]["capture_id"] == capture.capture_id
    assert item["outcome"] is not None
    assert item["outcome"]["id"] == outcome.id
    assert item["outcome"]["outcome"] == "success"


def test_list_inbox_filters_by_status_verdict_ready(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    _seed_resolved_capture(
        capture_store=client.capture_store,  # type: ignore[attr-defined]
        ledger_store=client.ledger_store,  # type: ignore[attr-defined]
        status="outcome_ready",
    )
    _seed_resolved_capture(
        capture_store=client.capture_store,  # type: ignore[attr-defined]
        ledger_store=client.ledger_store,  # type: ignore[attr-defined]
        symbol="ETHUSDT",
        status="verdict_ready",
    )

    r_ready = client.get("/captures/outcomes?status=verdict_ready")

    assert r_ready.status_code == 200
    body = r_ready.json()
    assert body["status"] == "verdict_ready"
    assert body["count"] == 1
    assert body["items"][0]["capture"]["symbol"] == "ETHUSDT"


def test_list_inbox_filters_by_user_id(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    _seed_resolved_capture(
        capture_store=client.capture_store,  # type: ignore[attr-defined]
        ledger_store=client.ledger_store,  # type: ignore[attr-defined]
        user_id="founder",
    )
    _seed_resolved_capture(
        capture_store=client.capture_store,  # type: ignore[attr-defined]
        ledger_store=client.ledger_store,  # type: ignore[attr-defined]
        symbol="ETHUSDT",
        user_id="beta-1",
    )

    r = client.get("/captures/outcomes?user_id=founder")
    body = r.json()
    assert body["count"] == 1
    assert body["items"][0]["capture"]["user_id"] == "founder"


def test_list_inbox_empty_when_no_resolved_captures(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    r = client.get("/captures/outcomes")
    assert r.status_code == 200
    assert r.json()["count"] == 0


def test_list_inbox_rejects_unsupported_status(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    # pydantic Literal blocks status='closed' from the inbox query.
    r = client.get("/captures/outcomes?status=closed")
    assert r.status_code == 422


def test_list_inbox_handles_missing_outcome_gracefully(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    # Capture references a phantom outcome_id — join must return outcome=None,
    # not 500.
    orphan = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="SOLUSDT",
        pattern_slug=PATTERN_SLUG,
        pattern_version=1,
        phase="ACCUMULATION",
        timeframe="1h",
        captured_at_ms=1_713_000_000_000,
        outcome_id="does-not-exist",
        status="outcome_ready",
    )
    client.capture_store.save(orphan)  # type: ignore[attr-defined]

    r = client.get("/captures/outcomes")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["items"][0]["outcome"] is None


# ── POST /captures/{capture_id}/verdict ─────────────────────────────────────

def test_verdict_writes_to_outcome_and_flips_capture(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    capture, outcome = _seed_resolved_capture(
        capture_store=client.capture_store,  # type: ignore[attr-defined]
        ledger_store=client.ledger_store,  # type: ignore[attr-defined]
    )

    r = client.post(
        f"/captures/{capture.capture_id}/verdict",
        json={"verdict": "valid", "user_note": "clean breakout on retest"},
    )

    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["user_verdict"] == "valid"
    assert body["status"] == "verdict_ready"

    # Outcome persisted with user_verdict + user_note
    reloaded_outcome = client.ledger_store.load(PATTERN_SLUG, outcome.id)  # type: ignore[attr-defined]
    assert reloaded_outcome is not None
    assert reloaded_outcome.user_verdict == "valid"
    assert reloaded_outcome.user_note == "clean breakout on retest"

    # Capture flipped + verdict_id linked to outcome.id
    reloaded_capture = client.capture_store.load(capture.capture_id)  # type: ignore[attr-defined]
    assert reloaded_capture is not None
    assert reloaded_capture.status == "verdict_ready"
    assert reloaded_capture.verdict_id == outcome.id

    # LEDGER:verdict appended exactly once
    assert len(client.verdict_records) == 1  # type: ignore[attr-defined]
    assert client.verdict_records[0].id == outcome.id  # type: ignore[attr-defined]


def test_verdict_is_idempotent_on_verdict_ready(tmp_path, monkeypatch) -> None:
    """Allow the user to change their mind — second verdict overwrites."""
    client = _client(tmp_path, monkeypatch)
    capture, outcome = _seed_resolved_capture(
        capture_store=client.capture_store,  # type: ignore[attr-defined]
        ledger_store=client.ledger_store,  # type: ignore[attr-defined]
    )

    first = client.post(
        f"/captures/{capture.capture_id}/verdict",
        json={"verdict": "valid"},
    )
    second = client.post(
        f"/captures/{capture.capture_id}/verdict",
        json={"verdict": "invalid", "user_note": "false break, retraced"},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    reloaded = client.ledger_store.load(PATTERN_SLUG, outcome.id)  # type: ignore[attr-defined]
    assert reloaded is not None
    assert reloaded.user_verdict == "invalid"
    assert reloaded.user_note == "false break, retraced"


def test_verdict_rejects_unknown_capture(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    r = client.post(
        "/captures/does-not-exist/verdict",
        json={"verdict": "valid"},
    )
    assert r.status_code == 404


def test_verdict_rejects_pending_outcome_status(tmp_path, monkeypatch) -> None:
    """Captures that haven't been resolved yet cannot receive a verdict."""
    client = _client(tmp_path, monkeypatch)
    pending = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="BTCUSDT",
        pattern_slug=PATTERN_SLUG,
        pattern_version=1,
        phase="ACCUMULATION",
        timeframe="1h",
        captured_at_ms=1_713_000_000_000,
        outcome_id=None,
        status="pending_outcome",
    )
    client.capture_store.save(pending)  # type: ignore[attr-defined]

    r = client.post(
        f"/captures/{pending.capture_id}/verdict",
        json={"verdict": "valid"},
    )
    assert r.status_code == 409


def test_verdict_rejects_capture_without_linked_outcome(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    capture = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="BTCUSDT",
        pattern_slug=PATTERN_SLUG,
        pattern_version=1,
        phase="ACCUMULATION",
        timeframe="1h",
        captured_at_ms=1_713_000_000_000,
        outcome_id=None,  # no linked outcome
        status="outcome_ready",  # inconsistent but reachable via direct DB edit
    )
    client.capture_store.save(capture)  # type: ignore[attr-defined]

    r = client.post(
        f"/captures/{capture.capture_id}/verdict",
        json={"verdict": "valid"},
    )
    assert r.status_code == 409


def test_verdict_rejects_invalid_label(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    capture, _ = _seed_resolved_capture(
        capture_store=client.capture_store,  # type: ignore[attr-defined]
        ledger_store=client.ledger_store,  # type: ignore[attr-defined]
    )

    r = client.post(
        f"/captures/{capture.capture_id}/verdict",
        json={"verdict": "bogus-label"},
    )
    assert r.status_code == 422


def test_verdict_404_when_linked_outcome_missing(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    orphan = CaptureRecord(
        capture_kind="manual_hypothesis",
        user_id="founder",
        symbol="BTCUSDT",
        pattern_slug=PATTERN_SLUG,
        pattern_version=1,
        phase="ACCUMULATION",
        timeframe="1h",
        captured_at_ms=1_713_000_000_000,
        outcome_id="missing-outcome",
        status="outcome_ready",
    )
    client.capture_store.save(orphan)  # type: ignore[attr-defined]

    r = client.post(
        f"/captures/{orphan.capture_id}/verdict",
        json={"verdict": "valid"},
    )
    assert r.status_code == 404
