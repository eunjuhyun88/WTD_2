from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import opportunity


def _client(monkeypatch) -> TestClient:
    async def _fake_get_universe(*, force_refresh: bool = False):  # noqa: ARG001
        return [
            {
                "symbol": "BTCUSDT",
                "base": "BTC",
                "name": "Bitcoin",
                "price": 70000.0,
                "pct_24h": 12.0,
                "vol_24h_usd": 2_000_000_000.0,
                "market_cap": 1_200_000_000_000.0,
                "trending_score": 0.92,
            },
            {
                "symbol": "ADAUSDT",
                "base": "ADA",
                "name": "Cardano",
                "price": 0.7,
                "pct_24h": -4.0,
                "vol_24h_usd": 80_000_000.0,
                "market_cap": 25_000_000_000.0,
                "trending_score": 0.41,
            },
        ]

    monkeypatch.setattr(opportunity, "get_universe", _fake_get_universe)

    app = FastAPI()
    app.include_router(opportunity.router, prefix="/opportunity")
    return TestClient(app)


def test_run_opportunity_scan(monkeypatch) -> None:
    client = _client(monkeypatch)

    res = client.post("/opportunity/run", json={"limit": 2})

    assert res.status_code == 200
    payload = res.json()
    assert payload["macroBackdrop"]["regime"] == "neutral"
    assert len(payload["coins"]) == 2
    assert payload["coins"][0]["symbol"] == "BTC"
    assert payload["coins"][0]["totalScore"] >= payload["coins"][1]["totalScore"]
    assert payload["coins"][0]["direction"] == "long"
    assert payload["coins"][0]["galaxyScore"] == 92.0
