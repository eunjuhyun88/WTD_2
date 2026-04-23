from __future__ import annotations

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import ctx
from exceptions import CacheMiss
from market_engine.indicator_catalog import CATALOG


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(ctx.router, prefix="/ctx")
    return TestClient(app)


def _klines_frame() -> pd.DataFrame:
    index = pd.date_range("2026-01-01", periods=600, freq="h", tz="UTC")
    close = pd.Series(range(100, 700), index=index, dtype=float)
    return pd.DataFrame(
        {
            "open": close - 1.0,
            "high": close + 2.0,
            "low": close - 2.0,
            "close": close,
            "volume": 1000.0,
            "taker_buy_base_volume": 520.0,
        },
        index=index,
    )


def test_ctx_fact_returns_engine_owned_bounded_context(monkeypatch) -> None:
    klines = _klines_frame()

    monkeypatch.setattr("market_engine.fact_plane.load_klines", lambda symbol, timeframe, offline=True: klines)
    monkeypatch.setattr("market_engine.fact_plane.load_perp", lambda symbol, offline=True: None)
    monkeypatch.setattr("market_engine.fact_plane.load_macro_bundle", lambda offline=True: None)
    monkeypatch.setattr("market_engine.fact_plane.load_onchain_bundle", lambda symbol, offline=True: None)
    monkeypatch.setattr("market_engine.fact_plane.load_dex_bundle", lambda symbol, offline=True: None)
    monkeypatch.setattr("market_engine.fact_plane.load_chain_bundle", lambda symbol, offline=True: None)

    response = _client().get("/ctx/fact", params={"symbol": "btcusdt", "timeframe": "1h"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["owner"] == "engine"
    assert payload["plane"] == "fact"
    assert payload["symbol"] == "BTCUSDT"
    assert payload["bars"]["count"] == 600
    assert payload["sources"]["klines"]["status"] == "ok"
    assert payload["sources"]["perp"]["status"] == "missing"
    assert payload["snapshot"]["symbol"] == "BTCUSDT"
    assert "rsi14" in payload["feature_row"]
    assert "funding_rate" in payload["feature_row"]


def test_ctx_fact_surfaces_cache_miss_as_service_unavailable(monkeypatch) -> None:
    def _raise_cache_miss(symbol, timeframe, offline=True):
        raise CacheMiss("BTCUSDT_1h not cached")

    monkeypatch.setattr("market_engine.fact_plane.load_klines", _raise_cache_miss)

    response = _client().get("/ctx/fact", params={"symbol": "BTCUSDT"})

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "klines_unavailable",
            "message": "BTCUSDT_1h not cached",
        }
    }


def test_ctx_indicator_catalog_returns_exactly_100_metrics() -> None:
    assert len(CATALOG) == 100

    response = _client().get("/ctx/indicator-catalog")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["owner"] == "engine"
    assert payload["plane"] == "fact"
    assert payload["kind"] == "indicator_catalog"
    assert payload["status"] == "transitional"
    assert isinstance(payload["generated_at"], str)
    assert payload["total"] == 100
    assert payload["matched"] == 100
    assert payload["coverage"]["usable_now"] == payload["coverage"]["live"] + payload["coverage"]["partial"]
    assert payload["counts"]["family"]["technical"] == 10
    assert payload["counts"]["family"]["derivatives"] == 18
    assert payload["counts"]["family"]["onchain"] == 24
    assert payload["counts"]["family"]["defi_dex"] == 18
    assert payload["counts"]["family"]["options"] == 10
    assert payload["counts"]["family"]["macro"] == 9
    assert payload["counts"]["family"]["social_tokenomics"] == 11


def test_ctx_indicator_catalog_supports_filters() -> None:
    response = _client().get(
        "/ctx/indicator-catalog",
        params={"status": "live", "family": "derivatives", "query": "funding"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filters"] == {
        "status": "live",
        "family": "derivatives",
        "stage": None,
        "query": "funding",
    }
    metric_ids = {metric["id"] for metric in payload["metrics"]}
    assert "funding_rate" in metric_ids
    assert "funding_rate_percentile" in metric_ids
    assert "funding_flip" in metric_ids
    assert all(metric["status"] == "live" for metric in payload["metrics"])
    assert all(metric["family"] == "derivatives" for metric in payload["metrics"])
    assert all(metric["current_owner"] in {"engine", "app_bridge", "none"} for metric in payload["metrics"])


def test_ctx_indicator_catalog_rejects_invalid_filter_values() -> None:
    status_response = _client().get("/ctx/indicator-catalog", params={"status": "wrong"})
    assert status_response.status_code == 400
    assert status_response.json()["detail"]["code"] == "invalid_status"

    family_response = _client().get("/ctx/indicator-catalog", params={"family": "wrong"})
    assert family_response.status_code == 400
    assert family_response.json()["detail"]["code"] == "invalid_family"

    stage_response = _client().get("/ctx/indicator-catalog", params={"stage": "wrong"})
    assert stage_response.status_code == 400
    assert stage_response.json()["detail"]["code"] == "invalid_stage"
