from __future__ import annotations

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import search
from capture.store import CaptureStore
from patterns.definitions import PatternDefinitionService
from patterns.library import PATTERN_LIBRARY
from patterns.registry import PatternRegistryStore
from search.corpus import SearchCorpusStore, build_corpus_windows


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(search.router, prefix="/search")
    return TestClient(app)


def _klines() -> pd.DataFrame:
    index = pd.date_range("2026-04-13", periods=8, freq="h", tz="UTC")
    close = [100.0 + i for i in range(8)]
    return pd.DataFrame(
        {
            "open": close,
            "high": [value + 1.0 for value in close],
            "low": [value - 1.0 for value in close],
            "close": close,
            "volume": [1_000.0] * 8,
        },
        index=index,
    )


def _definition_service(tmp_path) -> PatternDefinitionService:
    registry_store = PatternRegistryStore(tmp_path / "pattern_registry")
    registry_store.seed_from_library(PATTERN_LIBRARY)
    capture_store = CaptureStore(tmp_path / "captures.sqlite")
    return PatternDefinitionService(
        capture_store=capture_store,
        registry_store=registry_store,
    )


def test_search_catalog_route_returns_corpus_inventory(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    store.upsert_windows(
        build_corpus_windows("BTCUSDT", "1h", _klines(), window_bars=4, stride_bars=2)
    )
    monkeypatch.setattr(search, "SearchCorpusStore", lambda: store)

    response = _client().get("/search/catalog", params={"symbol": "BTCUSDT", "timeframe": "1h", "limit": 2})

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["owner"] == "engine"
    assert payload["plane"] == "search"
    assert payload["status"] == "live"
    assert payload["total_windows"] == 3
    assert len(payload["windows"]) == 2
    assert payload["windows"][0]["symbol"] == "BTCUSDT"
    assert payload["windows"][0]["signature"]["trend"] == "up"


def test_search_catalog_route_reports_empty_catalog(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    monkeypatch.setattr(search, "SearchCorpusStore", lambda: store)

    response = _client().get("/search/catalog")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "empty"
    assert payload["total_windows"] == 0
    assert payload["windows"] == []


def test_seed_search_route_persists_corpus_only_run(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    windows = build_corpus_windows("BTCUSDT", "1h", _klines(), window_bars=4, stride_bars=2)
    store.upsert_windows(windows)
    monkeypatch.setattr("search.runtime.SearchCorpusStore", lambda: store)
    monkeypatch.setattr(search, "_definition_service", _definition_service(tmp_path))

    response = _client().post(
        "/search/seed",
        json={
            "definition_id": "tradoor-oi-reversal-v1:v1",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "signature": windows[0].signature,
            "limit": 2,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["plane"] == "search"
    assert payload["status"] == "corpus_only"
    assert payload["request"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert payload["request"]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"
    assert len(payload["candidates"]) == 2
    assert payload["candidates"][0]["definition_ref"]["pattern_slug"] == "tradoor-oi-reversal-v1"
    assert payload["candidates"][0]["payload"]["definition_ref"]["pattern_family"] == "tradoor_oi_reversal_v1"

    followup = _client().get(f"/search/seed/{payload['run_id']}")
    assert followup.status_code == 200
    assert followup.json()["run_id"] == payload["run_id"]
    assert followup.json()["candidates"][0]["definition_ref"]["definition_id"] == "tradoor-oi-reversal-v1:v1"


def test_scan_route_persists_corpus_only_scan(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    store.upsert_windows(build_corpus_windows("SOLUSDT", "4h", _klines(), window_bars=4, stride_bars=2))
    monkeypatch.setattr("search.runtime.SearchCorpusStore", lambda: store)
    monkeypatch.setattr(search, "_definition_service", _definition_service(tmp_path))

    response = _client().post(
        "/search/scan",
        json={
            "definition_id": "funding-flip-reversal-v1:v1",
            "symbol": "SOLUSDT",
            "timeframe": "4h",
            "limit": 3,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "corpus_only"
    assert payload["candidates"][0]["symbol"] == "SOLUSDT"
    assert payload["request"]["definition_ref"]["pattern_slug"] == "funding-flip-reversal-v1"
    assert payload["candidates"][0]["definition_ref"]["definition_id"] == "funding-flip-reversal-v1:v1"

    followup = _client().get(f"/search/scan/{payload['scan_id']}")
    assert followup.status_code == 200
    assert followup.json()["scan_id"] == payload["scan_id"]


def test_search_result_routes_return_404_for_missing_runs(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    monkeypatch.setattr("search.runtime.SearchCorpusStore", lambda: store)
    monkeypatch.setattr(search, "_definition_service", _definition_service(tmp_path))

    response = _client().get("/search/seed/missing")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "seed_run_not_found"

    response = _client().get("/search/scan/missing")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "scan_not_found"


def test_search_routes_reject_invalid_definition_ids(monkeypatch, tmp_path) -> None:
    store = SearchCorpusStore(tmp_path / "search.sqlite")
    monkeypatch.setattr("search.runtime.SearchCorpusStore", lambda: store)
    monkeypatch.setattr(search, "_definition_service", _definition_service(tmp_path))

    invalid = _client().post("/search/seed", json={"definition_id": "bad-definition"})
    assert invalid.status_code == 400
    assert invalid.json()["detail"]["code"] == "search_definition_id_invalid"

    missing = _client().post("/search/scan", json={"definition_id": "missing-pattern:v1"})
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "search_definition_not_found"
