from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import runtime
from capture.store import CaptureStore
from capture.types import CaptureRecord
from patterns.definitions import PatternDefinitionService
from patterns.library import PATTERN_LIBRARY
from patterns.registry import PatternRegistryStore
from runtime.store import RuntimeStateStore




def _attach_fake_auth(app, user_id: str = "founder") -> None:
    @app.middleware("http")
    async def _inject_test_user_id(request, call_next):
        request.state.user_id = user_id
        return await call_next(request)
def _client(tmp_path, monkeypatch) -> TestClient:
    runtime_store = RuntimeStateStore(tmp_path / "runtime.sqlite")
    capture_store = CaptureStore(tmp_path / "capture.sqlite")
    registry_store = PatternRegistryStore(tmp_path / "pattern_registry")
    registry_store.seed_from_library(PATTERN_LIBRARY)
    appended = []

    class FakeRecordStore:
        def append_capture_record(self, record):
            appended.append(record)

    monkeypatch.setattr(runtime, "_runtime_store", runtime_store)
    monkeypatch.setattr(runtime, "_capture_store", capture_store)
    monkeypatch.setattr(
        runtime,
        "_definition_service",
        PatternDefinitionService(
            capture_store=capture_store,
            registry_store=registry_store,
        ),
    )
    monkeypatch.setattr(runtime.capture_routes, "LEDGER_RECORD_STORE", FakeRecordStore())

    app = FastAPI()
    app.include_router(runtime.router, prefix="/runtime")
    _attach_fake_auth(app)
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
            "pattern_slug": "tradoor-oi-reversal-v1",
            "phase": "ACCUMULATION",
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
    assert payload["capture"]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert len(client.appended_records) == 1  # type: ignore[attr-defined]

    capture_id = payload["capture"]["capture_id"]
    followup = client.get(f"/runtime/captures/{capture_id}")
    assert followup.status_code == 200
    assert followup.json()["capture"]["capture_id"] == capture_id
    assert followup.json()["capture"]["definition_ref"]["pattern_slug"] == "tradoor-oi-reversal-v1"


def test_runtime_capture_list_route_filters_engine_owned_records(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    client.post(
        "/runtime/captures",
        json={
            "capture_kind": "manual_hypothesis",
            "user_id": "founder",
            "symbol": "BTCUSDT",
            "pattern_slug": "tradoor-oi-reversal-v1",
            "phase": "ACCUMULATION",
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
            "pattern_slug": "funding-flip-reversal-v1",
            "phase": "ENTRY_ZONE",
            "timeframe": "4h",
            "user_note": "eth seed",
        },
    )

    response = client.get(
        "/runtime/captures?user_id=founder&definition_id=tradoor-oi-reversal-v1:v1&limit=10"
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["owner"] == "engine"
    assert payload["plane"] == "runtime"
    assert payload["status"] == "fallback_local"
    assert payload["count"] == 1
    assert payload["captures"][0]["symbol"] == "BTCUSDT"
    assert payload["captures"][0]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"


def test_runtime_capture_list_rejects_invalid_or_mismatched_definition_filters(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    invalid = client.get("/runtime/captures?definition_id=bad-definition")
    assert invalid.status_code == 400
    assert invalid.json()["detail"]["code"] == "runtime_definition_id_invalid"

    missing = client.get("/runtime/captures?definition_id=missing-pattern:v1")
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "runtime_definition_not_found"

    mismatch = client.get(
        "/runtime/captures?definition_id=tradoor-oi-reversal-v1:v1&pattern_slug=funding-flip-reversal-v1"
    )
    assert mismatch.status_code == 400
    assert mismatch.json()["detail"]["code"] == "runtime_definition_slug_mismatch"


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


def test_runtime_definition_routes_list_and_detail_include_linked_capture_evidence(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    client.capture_store.save(  # type: ignore[attr-defined]
        CaptureRecord(
            capture_kind="manual_hypothesis",
            user_id="founder",
            symbol="TRADOORUSDT",
            pattern_slug="tradoor-oi-reversal-v1",
            timeframe="15m",
            phase="ACCUMULATION",
            captured_at_ms=1770000000000,
            user_note="second dump seed",
            research_context={
                "pattern_family": "tradoor_ptb_oi_reversal",
                "thesis": ["second dump is the real event"],
                "research_tags": ["second_dump", "oi_reexpand"],
                "source": {"kind": "telegram_post", "title": "TRADOOR case"},
                "phase_annotations": [
                    {
                        "phase_id": "REAL_DUMP",
                        "label": "second dump",
                        "timeframe": "15m",
                    }
                ],
            },
        )
    )

    response = client.get("/runtime/definitions?limit=50")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["plane"] == "runtime"
    assert payload["count"] >= 1
    tradoor = next(item for item in payload["definitions"] if item["pattern_slug"] == "tradoor-oi-reversal-v1")
    assert tradoor["evidence_count"] == 1
    assert tradoor["thesis"] == ["second dump is the real event"]

    detail = client.get("/runtime/definitions/tradoor-oi-reversal-v1")
    assert detail.status_code == 200
    definition = detail.json()["definition"]
    assert definition["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert definition["pattern_family"] == "tradoor_ptb_oi_reversal"
    assert definition["registry"]["slug"] == "tradoor-oi-reversal-v1"
    assert definition["phase_template"][0]["phase_id"] == "FAKE_DUMP"
    assert definition["linked_evidence"][0]["capture_id"]
    assert definition["linked_evidence"][0]["research_tags"] == ["second_dump", "oi_reexpand"]


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
        definition_ref={
            "definition_id": "tradoor-oi-reversal-v1:v1",
            "pattern_slug": "tradoor-oi-reversal-v1",
        },
        payload={
            "verdict": "valid",
            "outcome": "win",
        },
    )

    response = client.get("/runtime/ledger/ledger_1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ledger"]["verdict"] == "valid"
    assert payload["ledger"]["outcome"] == "win"
    assert payload["ledger"]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"

    restarted = RuntimeStateStore(tmp_path / "runtime.sqlite")
    monkeypatch.setattr(runtime, "_runtime_store", restarted)
    followup = client.get("/runtime/ledger/ledger_1")
    assert followup.status_code == 200
    assert followup.json()["ledger"]["definition_ref"]["pattern_slug"] == "tradoor-oi-reversal-v1"

    listing = client.get("/runtime/ledger?definition_id=tradoor-oi-reversal-v1:v1&kind=verdict")
    assert listing.status_code == 200
    assert listing.json()["count"] == 1
    assert listing.json()["ledgers"][0]["id"] == "ledger_1"


def test_runtime_ledger_list_rejects_invalid_definition_filters(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    invalid = client.get("/runtime/ledger?definition_id=bad-definition")
    assert invalid.status_code == 400
    assert invalid.json()["detail"]["code"] == "runtime_definition_id_invalid"

    missing = client.get("/runtime/ledger?definition_id=missing-pattern:v1")
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "runtime_definition_not_found"


def test_runtime_routes_return_404_for_missing_records(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)

    assert client.get("/runtime/captures/missing").status_code == 404
    assert client.get("/runtime/definitions/missing").status_code == 404
    assert client.get("/runtime/setups/missing").status_code == 404
    assert client.get("/runtime/research-contexts/missing").status_code == 404
    assert client.get("/runtime/ledger/missing").status_code == 404
