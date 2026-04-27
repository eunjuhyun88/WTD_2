"""Unit tests for D-03-eng: POST /captures/{id}/watch + GET /captures?watching=true."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import captures
from capture.store import CaptureStore, now_ms
from capture.types import CaptureRecord
from patterns.state_store import PatternStateStore
from research.pattern_search import BenchmarkPackStore, PatternSearchArtifactStore


def _build_client(tmp_path, monkeypatch) -> TestClient:
    capture_store = CaptureStore(tmp_path / "capture.sqlite")
    state_store = PatternStateStore(tmp_path / "runtime.sqlite")
    benchmark_pack_store = BenchmarkPackStore(tmp_path / "benchmark_packs")
    pattern_search_artifact_store = PatternSearchArtifactStore(tmp_path / "search_runs")

    class FakeRecordStore:
        def append_capture_record(self, record):
            pass

        def append_verdict_record(self, outcome):
            pass

    monkeypatch.setattr(captures, "_capture_store", capture_store)
    monkeypatch.setattr(captures, "_state_store", state_store)
    monkeypatch.setattr(captures, "_benchmark_pack_store", benchmark_pack_store)
    monkeypatch.setattr(captures, "_pattern_search_artifact_store", pattern_search_artifact_store)
    monkeypatch.setattr(captures, "LEDGER_RECORD_STORE", FakeRecordStore())

    app = FastAPI()
    app.include_router(captures.router, prefix="/captures")

    @app.middleware("http")
    async def _inject_user(request, call_next):
        request.state.user_id = "testuser"
        return await call_next(request)

    client = TestClient(app)
    client.capture_store = capture_store  # type: ignore[attr-defined]
    return client


def _seed_capture(capture_store: CaptureStore, symbol: str = "BTCUSDT") -> CaptureRecord:
    record = CaptureRecord(
        capture_kind="chart_bookmark",
        user_id="testuser",
        symbol=symbol,
        pattern_slug="",
        phase="",
        timeframe="1h",
        captured_at_ms=now_ms(),
        status="closed",
    )
    capture_store.save(record)
    return record


# ── D-03-eng-1 / D-03-eng-3: POST watch → 200 OK, idempotent ────────────────

def test_watch_capture_returns_200(tmp_path, monkeypatch) -> None:
    client = _build_client(tmp_path, monkeypatch)
    record = _seed_capture(client.capture_store)

    resp = client.post(f"/captures/{record.capture_id}/watch")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["status"] == "watching"
    assert body["capture_id"] == record.capture_id


def test_watch_capture_idempotent(tmp_path, monkeypatch) -> None:
    client = _build_client(tmp_path, monkeypatch)
    record = _seed_capture(client.capture_store)
    capture_id = record.capture_id

    resp1 = client.post(f"/captures/{capture_id}/watch")
    assert resp1.status_code == 200

    resp2 = client.post(f"/captures/{capture_id}/watch")
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "watching"


def test_watch_capture_404_for_unknown_id(tmp_path, monkeypatch) -> None:
    client = _build_client(tmp_path, monkeypatch)
    resp = client.post("/captures/nonexistent-id/watch")
    assert resp.status_code == 404


# ── D-03-eng-2: is_watching persisted in store ───────────────────────────────

def test_watch_persists_is_watching_flag(tmp_path, monkeypatch) -> None:
    client = _build_client(tmp_path, monkeypatch)
    record = _seed_capture(client.capture_store)

    assert client.capture_store.load(record.capture_id).is_watching is False

    client.post(f"/captures/{record.capture_id}/watch")

    loaded = client.capture_store.load(record.capture_id)
    assert loaded is not None
    assert loaded.is_watching is True


# ── D-03-eng-4: GET /captures?watching=true filter ───────────────────────────

def test_list_watching_filter(tmp_path, monkeypatch) -> None:
    client = _build_client(tmp_path, monkeypatch)

    watched = _seed_capture(client.capture_store, symbol="ETHUSDT")
    _ignored = _seed_capture(client.capture_store, symbol="SOLUSDT")

    client.post(f"/captures/{watched.capture_id}/watch")

    resp = client.get("/captures?watching=true")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    ids = [c["capture_id"] for c in body["captures"]]
    assert watched.capture_id in ids
    assert _ignored.capture_id not in ids


def test_list_watching_false_excludes_watched(tmp_path, monkeypatch) -> None:
    client = _build_client(tmp_path, monkeypatch)

    watched = _seed_capture(client.capture_store, symbol="ETHUSDT")
    not_watched = _seed_capture(client.capture_store, symbol="SOLUSDT")

    client.post(f"/captures/{watched.capture_id}/watch")

    resp = client.get("/captures?watching=false")
    assert resp.status_code == 200
    body = resp.json()
    ids = [c["capture_id"] for c in body["captures"]]
    assert not_watched.capture_id in ids
    assert watched.capture_id not in ids


def test_list_no_watching_param_returns_all(tmp_path, monkeypatch) -> None:
    client = _build_client(tmp_path, monkeypatch)

    r1 = _seed_capture(client.capture_store, symbol="BTCUSDT")
    r2 = _seed_capture(client.capture_store, symbol="ETHUSDT")
    client.post(f"/captures/{r1.capture_id}/watch")

    resp = client.get("/captures")
    assert resp.status_code == 200
    body = resp.json()
    ids = [c["capture_id"] for c in body["captures"]]
    assert r1.capture_id in ids
    assert r2.capture_id in ids
