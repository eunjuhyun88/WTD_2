from __future__ import annotations

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import search
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
