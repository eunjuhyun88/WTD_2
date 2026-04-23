from __future__ import annotations

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import facts
from market_engine.fact_plane import FactContextBuildError
from market_engine.fact_read_models import (
    build_confluence_context,
    build_market_cap_context,
    build_price_context,
    build_reference_stack,
)


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(facts.router, prefix="/facts")
    return TestClient(app)


def _fake_fact_context() -> dict:
    return {
        "ok": True,
        "generated_at": "2026-04-23T00:00:00+00:00",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "bars": {
            "count": 600,
            "min_required": 500,
            "start_at": "2026-01-01T00:00:00+00:00",
            "end_at": "2026-01-25T23:00:00+00:00",
        },
        "market": {
            "price": 72000.0,
            "open": 71000.0,
            "high": 72500.0,
            "low": 70500.0,
            "volume": 12345.0,
            "timestamp": "2026-01-25T23:00:00+00:00",
        },
        "sources": {
            "klines": {"status": "ok", "rows": 600, "end_at": "2026-01-25T23:00:00+00:00"},
            "perp": {"status": "ok", "rows": 600, "end_at": "2026-01-25T23:00:00+00:00"},
            "macro": {"status": "ok", "rows": 365, "end_at": "2026-01-25T00:00:00+00:00"},
            "onchain": {"status": "ok", "rows": 365, "end_at": "2026-01-25T00:00:00+00:00"},
            "dex": {"status": "missing", "rows": 0},
            "chain": {"status": "missing", "rows": 0},
        },
        "feature_row": {
            "ema_alignment": "bullish",
            "htf_structure": "uptrend",
            "range_7d_position": 0.82,
            "dist_from_20d_high": -0.03,
            "dist_from_20d_low": 0.18,
            "regime": "risk_on",
            "funding_rate": -0.0012,
            "oi_change_1h": 0.021,
            "oi_change_24h": 0.054,
            "long_short_ratio": 0.91,
            "taker_buy_ratio_1h": 0.63,
            "cvd_state": "buying",
            "mvrv_zscore": -0.3,
            "fear_greed": 22.0,
            "coinbase_premium": 0.0021,
        },
        "snapshot": {"symbol": "BTCUSDT"},
    }


def test_build_price_context_transforms_fact_context(monkeypatch) -> None:
    monkeypatch.setattr(
        "market_engine.fact_read_models.build_fact_context",
        lambda symbol, timeframe="1h", offline=True: _fake_fact_context(),
    )

    payload = build_price_context(symbol="BTCUSDT", timeframe="1h")

    assert payload["kind"] == "price_context"
    assert payload["owner"] == "engine"
    assert payload["market"]["price"] == 72000.0
    assert payload["structure"]["ema_alignment"] == "bullish"
    assert payload["sources"]["klines"]["state"] == "live"


def test_build_reference_stack_includes_catalog_coverage(monkeypatch) -> None:
    monkeypatch.setattr(
        "market_engine.fact_read_models.build_fact_context",
        lambda symbol, timeframe="1h", offline=True: _fake_fact_context(),
    )
    monkeypatch.setattr(
        "market_engine.fact_read_models.build_indicator_catalog",
        lambda: {
            "total": 100,
            "coverage": {"live": 41, "partial": 27, "usable_now": 68, "coverage_pct": 68.0},
            "counts": {"status": {"live": 41, "partial": 27, "blocked": 11, "missing": 21}},
        },
    )

    payload = build_reference_stack()

    assert payload["kind"] == "reference_stack"
    assert payload["coverage"]["usable_now"] == 68
    ids = {source["id"] for source in payload["sources"]}
    assert "indicator_catalog" in ids
    assert "klines" in ids


def test_build_market_cap_context_uses_macro_bundle(monkeypatch) -> None:
    index = pd.to_datetime(["2026-04-23T00:00:00Z"])
    frame = pd.DataFrame(
        {
            "btc_dominance": [61.4],
            "fear_greed": [44.0],
        },
        index=index,
    )
    monkeypatch.setattr("market_engine.fact_read_models.load_macro_bundle", lambda offline=True: frame)

    payload = build_market_cap_context()

    assert payload["kind"] == "market_cap"
    assert payload["btc_dominance"] == 61.4
    assert payload["status"] == "transitional"
    assert payload["sources"]["macro"]["status"] == "live"


def test_build_confluence_context_produces_bullish_summary(monkeypatch) -> None:
    monkeypatch.setattr(
        "market_engine.fact_read_models.build_fact_context",
        lambda symbol, timeframe="1h", offline=True: _fake_fact_context(),
    )

    payload = build_confluence_context(symbol="BTCUSDT", timeframe="1h")

    assert payload["kind"] == "confluence"
    assert payload["summary"]["bias"] == "bullish"
    assert payload["summary"]["score"] > 0
    metrics = {row["metric"] for row in payload["evidence"]}
    assert "ema_alignment" in metrics
    assert "perp_crowding" in metrics
    assert "mvrv_zscore" in metrics


def test_facts_price_context_route_returns_payload(monkeypatch) -> None:
    monkeypatch.setattr(
        "api.routes.facts.build_price_context",
        lambda symbol, timeframe="1h", offline=True: {"ok": True, "kind": "price_context", "symbol": symbol},
    )

    response = _client().get("/facts/price-context", params={"symbol": "BTCUSDT"})

    assert response.status_code == 200
    assert response.json() == {"ok": True, "kind": "price_context", "symbol": "BTCUSDT"}


def test_facts_confluence_route_surfaces_fact_errors(monkeypatch) -> None:
    def _raise(*args, **kwargs):
        raise FactContextBuildError(503, "klines_unavailable", "BTCUSDT_1h not cached")

    monkeypatch.setattr("api.routes.facts.build_confluence_context", _raise)

    response = _client().get("/facts/confluence", params={"symbol": "BTCUSDT"})

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "klines_unavailable",
            "message": "BTCUSDT_1h not cached",
        }
    }


def test_facts_market_cap_route_returns_payload(monkeypatch) -> None:
    monkeypatch.setattr(
        "api.routes.facts.build_market_cap_context",
        lambda offline=True: {"ok": True, "kind": "market_cap", "btc_dominance": 60.5},
    )

    response = _client().get("/facts/market-cap")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "kind": "market_cap", "btc_dominance": 60.5}


def test_facts_indicator_catalog_route_returns_canonical_inventory(monkeypatch) -> None:
    monkeypatch.setattr(
        "api.routes.facts.build_indicator_catalog",
        lambda **kwargs: {
            "ok": True,
            "owner": "engine",
            "plane": "fact",
            "kind": "indicator_catalog",
            "status": "transitional",
            "generated_at": "2026-04-23T00:00:00+00:00",
            "filters": kwargs,
            "metrics": [],
        },
    )

    response = _client().get(
        "/facts/indicator-catalog",
        params={"status": "live", "family": "derivatives", "stage": "promoted", "query": "funding"},
    )

    assert response.status_code == 200
    assert response.json()["filters"] == {
        "status": "live",
        "family": "derivatives",
        "stage": "promoted",
        "query": "funding",
    }


def test_facts_indicator_catalog_route_rejects_invalid_filters() -> None:
    response = _client().get("/facts/indicator-catalog", params={"stage": "wrong"})

    assert response.status_code == 400
    assert response.json() == {
        "detail": {
            "code": "invalid_stage",
            "message": "stage must be one of cataloged, readable, operational, promoted",
        }
    }
