"""Tests for /features API routes."""
from __future__ import annotations

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from api.main import app as _base_app, include_engine_routes
from fastapi import FastAPI


def create_app() -> FastAPI:
    test_app = FastAPI()
    include_engine_routes(test_app)
    return test_app
from features.materialization_store import FeatureMaterializationStore
from scanner.jobs.feature_materialization import materialize_symbol_window


def _make_bars(n: int = 80) -> pd.DataFrame:
    idx = pd.date_range("2026-01-01", periods=n, freq="1h", tz="UTC")
    import numpy as np

    rng = np.random.default_rng(42)
    close = 100.0 + rng.normal(0, 1, n).cumsum()
    return pd.DataFrame(
        {
            "open": close - 0.1,
            "high": close + 0.5,
            "low": close - 0.5,
            "close": close,
            "volume": rng.uniform(1000, 5000, n),
            "quote_volume": rng.uniform(1e6, 5e6, n),
            "taker_buy_base_volume": rng.uniform(500, 2500, n),
        },
        index=idx,
    )


@pytest.fixture()
def _seeded_store(tmp_path, monkeypatch):
    store = FeatureMaterializationStore(tmp_path / "test.sqlite")
    bars = _make_bars()
    materialize_symbol_window(
        symbol="BTCUSDT",
        timeframe="1h",
        venue="binance",
        offline=True,
        store=store,
        bars=bars,
    )
    monkeypatch.setattr("api.routes.features._store", store)
    return store


@pytest.fixture()
def client():
    app = create_app()
    return TestClient(app, raise_server_exceptions=False)


def test_get_feature_window_on_demand(client, tmp_path, monkeypatch):
    store = FeatureMaterializationStore(tmp_path / "test.sqlite")
    bars = _make_bars()
    monkeypatch.setattr("api.routes.features._store", store)
    monkeypatch.setattr(
        "scanner.jobs.feature_materialization.load_klines",
        lambda symbol, timeframe, **_: bars,
    )
    monkeypatch.setattr(
        "scanner.jobs.feature_materialization.load_perp",
        lambda symbol, **_: pd.DataFrame(),
    )

    resp = client.get("/features/window?symbol=BTCUSDT&timeframe=1h")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert "feature_window" in data
    fw = data["feature_window"]
    assert fw["symbol"] == "BTCUSDT"
    assert fw["timeframe"] == "1h"
    assert "oi_zscore" in fw
    assert "funding_flip_flag" in fw
    assert "phase_guess" in fw


def test_get_feature_window_404_no_cache(client, tmp_path, monkeypatch):
    store = FeatureMaterializationStore(tmp_path / "empty.sqlite")
    monkeypatch.setattr("api.routes.features._store", store)
    monkeypatch.setattr(
        "scanner.jobs.feature_materialization.load_klines",
        lambda *a, **kw: (_ for _ in ()).throw(FileNotFoundError("no cache")),
    )
    monkeypatch.setattr(
        "scanner.jobs.feature_materialization.load_perp",
        lambda *a, **kw: pd.DataFrame(),
    )

    resp = client.get("/features/window?symbol=XXXUSDT&timeframe=1h")
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "no_cache"


def test_get_pattern_events_empty(_seeded_store, client):
    resp = client.get(
        "/features/pattern-events?symbol=BTCUSDT&timeframe=1h&pattern_family=unknown_family"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["count"] == 0
    assert data["events"] == []
