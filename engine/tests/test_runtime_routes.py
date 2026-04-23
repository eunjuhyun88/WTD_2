from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import runtime
from capture.store import CaptureStore
from runtime.store import RuntimeStateStore


def _client(tmp_path, monkeypatch) -> TestClient:
    runtime_store = RuntimeStateStore(tmp_path / "runtime.sqlite")
    capture_store = CaptureStore(tmp_path / "capture.sqlite")
    appended = []

    class FakeRecordStore:
        def append_capture_record(self, record):
            appended.append(record)

    monkeypatch.setattr(runtime, "_runtime_store", runtime_store)
    monkeypatch.setattr(runtime, "_capture_store", capture_store)
    monkeypatch.setattr(runtime.capture_routes, "LEDGER_RECORD_STORE", FakeRecordStore())

    app = FastAPI()
    app.include_router(runtime.router, prefix="/runtime")
    client = TestClient(app)
    client.runtime_store = runtime_store  # type: ignore[attr-defined]
    client.capture_store = capture_store  # type: ignore[attr-defined]
    client.appended_records = appended  # type: ignore[attr-defined]
    return client


def test_runtime_capture_routes_create_and_read_engine_owned_capture(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    response = client.post(
        "/runtime/captures",
        json={
            "capture_kind": "manual_hypothesis",
            "user_id": "founder",
            "symbol": "SOLUSDT",
            "timeframe": "1h",
            "user_note": "runtime route seed",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["owner"] == "engine"
    assert payload["plane"] == "runtime"
    assert payload["status"] == "fallback_local"
    assert payload["capture"]["status"] == "pending_outcome"
    assert len(client.appended_records) == 1  # type: ignore[attr-defined]

    capture_id = payload["capture"]["capture_id"]
    followup = client.get(f"/runtime/captures/{capture_id}")
    assert followup.status_code == 200
    assert followup.json()["capture"]["capture_id"] == capture_id


def test_runtime_capture_list_route_filters_engine_owned_records(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    client.post(
        "/runtime/captures",
        json={
            "capture_kind": "manual_hypothesis",
            "user_id": "founder",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "user_note": "btc seed",
        },
    )
    client.post(
        "/runtime/captures",
        json={
            "capture_kind": "manual_hypothesis",
            "user_id": "founder",
            "symbol": "ETHUSDT",
            "timeframe": "4h",
            "user_note": "eth seed",
        },
    )

    response = client.get("/runtime/captures?user_id=founder&symbol=BTCUSDT&limit=10")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["owner"] == "engine"
    assert payload["plane"] == "runtime"
    assert payload["status"] == "fallback_local"
    assert payload["count"] == 1
    assert payload["captures"][0]["symbol"] == "BTCUSDT"


def test_runtime_workspace_pins_survive_store_restart(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    response = client.post(
        "/runtime/workspace/pins",
        json={
            "symbol": "btcusdt",
            "timeframe": "4h",
            "kind": "compare",
            "summary": "BTC 4h setup",
            "payload": {"search_ref": "scan_1"},
        },
    )

    assert response.status_code == 200
    workspace = response.json()["workspace"]
    assert workspace["symbol"] == "BTCUSDT"
    assert workspace["pins"][0]["kind"] == "compare"

    restarted = RuntimeStateStore(tmp_path / "runtime.sqlite")
    monkeypatch.setattr(runtime, "_runtime_store", restarted)
    followup = client.get("/runtime/workspace/BTCUSDT")
    assert followup.status_code == 200
    assert followup.json()["workspace"]["pins"][0]["payload"]["search_ref"] == "scan_1"


def test_runtime_setup_and_research_context_routes(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    setup_response = client.post(
        "/runtime/setups",
        json={
            "symbol": "ETHUSDT",
            "timeframe": "1h",
            "title": "ETH continuation",
            "summary": "saved setup",
            "payload": {"fact_ref": "fact_1"},
        },
    )
    assert setup_response.status_code == 200
    setup_id = setup_response.json()["setup"]["id"]
    assert client.get(f"/runtime/setups/{setup_id}").json()["setup"]["title"] == "ETH continuation"

    context_response = client.post(
        "/runtime/research-contexts",
        json={
            "symbol": "ETHUSDT",
            "pattern_slug": "tradoor-oi-reversal-v1",
            "title": "ETH second dump",
            "summary": "research context",
            "fact_refs": ["fact_1"],
            "search_refs": ["run_1"],
        },
    )
    assert context_response.status_code == 200
    context_id = context_response.json()["research_context"]["id"]
    followup = client.get(f"/runtime/research-contexts/{context_id}")
    assert followup.status_code == 200
    assert followup.json()["research_context"]["search_refs"] == ["run_1"]


def test_runtime_ledger_projection_route(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    client.runtime_store.upsert_ledger_entry(  # type: ignore[attr-defined]
        ledger_id="ledger_1",
        kind="verdict",
        subject_id="cap_1",
        summary="valid setup",
        payload={"verdict": "valid", "outcome": "win"},
    )

    response = client.get("/runtime/ledger/ledger_1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ledger"]["verdict"] == "valid"
    assert payload["ledger"]["outcome"] == "win"


def test_runtime_routes_return_404_for_missing_records(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    assert client.get("/runtime/captures/missing").status_code == 404
    assert client.get("/runtime/setups/missing").status_code == 404
    assert client.get("/runtime/research-contexts/missing").status_code == 404
    assert client.get("/runtime/ledger/missing").status_code == 404
