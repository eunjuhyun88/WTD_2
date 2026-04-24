from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import universe
from data_cache.market_search import MarketSearchCandidate, MarketSearchIndexStatus


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(universe.router, prefix="/universe")
    return TestClient(app)


def test_universe_query_uses_market_search_index(monkeypatch) -> None:
    async def _should_not_build_universe(force_refresh: bool = False):
        raise AssertionError("search queries should not build the full universe on cache hits")

    monkeypatch.setattr(universe, "get_universe", _should_not_build_universe)
    monkeypatch.setattr(universe, "get_universe_updated_at", lambda: "2026-04-24T00:00:00+00:00")
    monkeypatch.setattr(
        universe,
        "get_cached_universe",
        lambda: [
            {
                "rank": 7,
                "symbol": "AEROUSDT",
                "base": "AERO",
                "name": "Aerodrome",
                "sector": "DeFi",
                "price": 0.4374,
                "pct_24h": 3.09,
                "vol_24h_usd": 719_332.55,
                "market_cap": 0.0,
                "oi_usd": 12_345.0,
                "is_futures": True,
                "trending_score": 11.0,
            }
        ],
    )
    monkeypatch.setattr(universe, "CanonicalRawStore", lambda: object())
    monkeypatch.setattr(
        universe,
        "search_market_candidates",
        lambda query, limit=10, store=None, allow_live_fallback=False: [
            MarketSearchCandidate(
                query=query,
                provider="binance",
                source="direct",
                chain="",
                base_symbol="AERO",
                base_name="Aerodrome",
                quote_symbol="USDT",
                canonical_symbol="AEROUSDT",
                token_address="",
                pair_address="",
                liquidity_usd=0.0,
                volume_h24=0.0,
                price_change_h24=0.0,
                futures_listed=True,
                watchlist_grade=None,
                note="",
            )
        ],
    )
    monkeypatch.setattr(
        universe,
        "get_market_search_index_status",
        lambda store=None: MarketSearchIndexStatus(
            row_count=569,
            updated_at="2026-04-24T00:01:00+00:00",
            ready=True,
        ),
    )

    response = _client().get("/universe", params={"q": "AERO", "limit": 10})

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["updated_at"] == "2026-04-24T00:01:00+00:00"
    assert payload["tokens"][0]["symbol"] == "AEROUSDT"
    assert payload["tokens"][0]["name"] == "Aerodrome"
    assert payload["tokens"][0]["price"] == 0.4374


def test_universe_query_refresh_can_force_cached_enrichment(monkeypatch) -> None:
    async def fake_get_universe(force_refresh: bool = False):
        assert force_refresh is True
        return [
            {
                "rank": 7,
                "symbol": "AEROUSDT",
                "base": "AERO",
                "name": "Aerodrome",
                "sector": "DeFi",
                "price": 0.4374,
                "pct_24h": 3.09,
                "vol_24h_usd": 719_332.55,
                "market_cap": 0.0,
                "oi_usd": 12_345.0,
                "is_futures": True,
                "trending_score": 11.0,
            }
        ]

    monkeypatch.setattr(universe, "get_universe", fake_get_universe)
    monkeypatch.setattr(universe, "get_cached_universe", lambda: [])
    monkeypatch.setattr(universe, "get_universe_updated_at", lambda: "2026-04-24T00:00:00+00:00")
    monkeypatch.setattr(universe, "CanonicalRawStore", lambda: object())
    monkeypatch.setattr(
        universe,
        "search_market_candidates",
        lambda query, limit=10, store=None, allow_live_fallback=False: [
            MarketSearchCandidate(
                query=query,
                provider="binance",
                source="direct",
                chain="",
                base_symbol="AERO",
                base_name="Aerodrome",
                quote_symbol="USDT",
                canonical_symbol="AEROUSDT",
                token_address="",
                pair_address="",
                liquidity_usd=0.0,
                volume_h24=0.0,
                price_change_h24=0.0,
                futures_listed=True,
                watchlist_grade=None,
                note="",
            )
        ],
    )
    monkeypatch.setattr(
        universe,
        "get_market_search_index_status",
        lambda store=None: MarketSearchIndexStatus(
            row_count=569,
            updated_at="2026-04-24T00:01:00+00:00",
            ready=True,
        ),
    )

    response = _client().get("/universe", params={"q": "AERO", "limit": 10, "refresh": "true"})

    assert response.status_code == 200
    assert response.json()["tokens"][0]["price"] == 0.4374


def test_universe_search_status_returns_index_health(monkeypatch) -> None:
    monkeypatch.setattr(universe, "CanonicalRawStore", lambda: object())
    monkeypatch.setattr(
        universe,
        "get_market_search_index_status",
        lambda store=None: MarketSearchIndexStatus(
            row_count=569,
            updated_at="2026-04-24T00:01:00+00:00",
            ready=True,
        ),
    )

    response = _client().get("/universe/search/status")

    assert response.status_code == 200
    assert response.json() == {
        "row_count": 569,
        "updated_at": "2026-04-24T00:01:00+00:00",
        "ready": True,
    }
