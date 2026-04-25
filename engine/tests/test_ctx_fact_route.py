from __future__ import annotations

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import ctx
from exceptions import CacheMiss


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
    assert payload["fact_id"].startswith("fact:BTCUSDT:1h:")
    assert payload["symbol"] == "BTCUSDT"
    assert payload["fact_id"].startswith("BTCUSDT:1h:")
    assert payload["bars"]["count"] == 600
    assert payload["sources"]["klines"]["status"] == "ok"
    assert payload["sources"]["perp"]["status"] == "missing"
    assert payload["provider_state"]["klines"]["status"] == "live"
    assert payload["provider_state"]["perp"]["status"] == "blocked"
    assert payload["reference_health"] == {
        "live": 1,
        "blocked": 5,
        "reference_only": 0,
        "stale": 0,
    }
    assert payload["confluence"]["verdict"] in {"bullish", "neutral", "bearish"}
    assert payload["confluence"]["regime"] is not None
    assert payload["snapshot"]["symbol"] == "BTCUSDT"
    assert payload["confluence"]["verdict"] == "bullish"
    assert payload["confluence"]["regime"] == payload["snapshot"]["regime"]
    assert payload["confluence"]["confidence"] > 0
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
