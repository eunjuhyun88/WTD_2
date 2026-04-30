"""W-0351: Personalization weights wiring tests.

AC1: two users with different verdict history → different coin ordering
AC2: anonymous user (user_id=None) → same ordering as base (regression)
AC4: USER_VERDICT_WEIGHT_STORE.get_adjustments is called when user_id provided
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import opportunity
from memory.state_store import UserVerdictWeightStore


_UNIVERSE = [
    {
        "symbol": "BTCUSDT",
        "base": "BTC",
        "name": "Bitcoin",
        "price": 70000.0,
        "pct_24h": 5.0,
        "vol_24h_usd": 500_000_000.0,
        "market_cap": 1_200_000_000_000.0,
        "trending_score": 0.70,
    },
    {
        "symbol": "ETHUSDT",
        "base": "ETH",
        "name": "Ethereum",
        "price": 3500.0,
        "pct_24h": 5.0,
        "vol_24h_usd": 500_000_000.0,
        "market_cap": 400_000_000_000.0,
        "trending_score": 0.70,
    },
]


def _client(monkeypatch, store: UserVerdictWeightStore) -> TestClient:
    async def _fake_get_universe(*, force_refresh: bool = False):
        return list(_UNIVERSE)

    monkeypatch.setattr(opportunity, "get_universe", _fake_get_universe)
    monkeypatch.setattr(opportunity, "USER_VERDICT_WEIGHT_STORE", store)

    app = FastAPI()
    app.include_router(opportunity.router, prefix="/opportunity")
    return TestClient(app)


def _warm_store(store: UserVerdictWeightStore, user_id: str, symbol: str, verdict: str, n: int) -> None:
    """Apply verdict n times. Need ≥5 total to pass cold-start gate."""
    for _ in range(n):
        store.apply(user_id, [f"symbol:{symbol}"], verdict)


# ---------------------------------------------------------------------------
# AC1: different verdict history → different ordering
# ---------------------------------------------------------------------------

def test_ac1_different_users_get_different_ordering(monkeypatch, tmp_path: Path) -> None:
    store = UserVerdictWeightStore(db_path=tmp_path / "w.db")

    # User A: strong preference for BTC (5 valid → delta +0.25)
    _warm_store(store, "user-A", "BTCUSDT", "valid", 5)
    # User B: strong preference for ETH (5 valid → delta +0.25), BTC penalized
    _warm_store(store, "user-B", "ETHUSDT", "valid", 5)

    client = _client(monkeypatch, store)

    res_a = client.post("/opportunity/run", json={"limit": 2, "user_id": "user-A"})
    res_b = client.post("/opportunity/run", json={"limit": 2, "user_id": "user-B"})

    assert res_a.status_code == 200
    assert res_b.status_code == 200

    coins_a = res_a.json()["coins"]
    coins_b = res_b.json()["coins"]

    # AC1: at least 1 swap — user A gets BTC first, user B gets ETH first
    first_a = coins_a[0]["symbol"]
    first_b = coins_b[0]["symbol"]
    assert first_a != first_b, (
        f"Expected different top coin for user A ({first_a}) vs user B ({first_b})"
    )


# ---------------------------------------------------------------------------
# AC2: anonymous user → base ordering unchanged (regression)
# ---------------------------------------------------------------------------

def test_ac2_anonymous_uses_base_ordering(monkeypatch, tmp_path: Path) -> None:
    store = UserVerdictWeightStore(db_path=tmp_path / "w.db")
    client = _client(monkeypatch, store)

    res_anon = client.post("/opportunity/run", json={"limit": 2})
    res_explicit_none = client.post("/opportunity/run", json={"limit": 2, "user_id": None})

    assert res_anon.status_code == 200
    assert res_explicit_none.status_code == 200

    coins_anon = res_anon.json()["coins"]
    coins_none = res_explicit_none.json()["coins"]

    # Both should return identical ordering
    assert [c["symbol"] for c in coins_anon] == [c["symbol"] for c in coins_none]

    # totalScore ordering preserved (regression from existing test)
    assert coins_anon[0]["totalScore"] >= coins_anon[1]["totalScore"]


# ---------------------------------------------------------------------------
# AC2b: cold start (≤4 verdicts) → same as base
# ---------------------------------------------------------------------------

def test_ac2b_cold_start_returns_base_ordering(monkeypatch, tmp_path: Path) -> None:
    store = UserVerdictWeightStore(db_path=tmp_path / "w.db")
    # Only 4 verdicts — below cold-start gate of 5
    _warm_store(store, "user-cold", "BTCUSDT", "valid", 4)

    client = _client(monkeypatch, store)

    res_base = client.post("/opportunity/run", json={"limit": 2})
    res_cold = client.post("/opportunity/run", json={"limit": 2, "user_id": "user-cold"})

    assert [c["symbol"] for c in res_base.json()["coins"]] == \
           [c["symbol"] for c in res_cold.json()["coins"]]


# ---------------------------------------------------------------------------
# AC4: get_adjustments is called for authenticated user
# ---------------------------------------------------------------------------

def test_ac4_get_adjustments_called_for_user(monkeypatch, tmp_path: Path) -> None:
    store = UserVerdictWeightStore(db_path=tmp_path / "w.db")
    calls: list[str] = []
    original = store.get_adjustments

    def _spy(user_id: str) -> dict:
        calls.append(user_id)
        return original(user_id)

    store.get_adjustments = _spy  # type: ignore[method-assign]
    client = _client(monkeypatch, store)

    client.post("/opportunity/run", json={"limit": 2, "user_id": "user-spy"})
    assert "user-spy" in calls, "get_adjustments was not called for authenticated user"

    # Anonymous — should NOT call get_adjustments
    calls.clear()
    client.post("/opportunity/run", json={"limit": 2})
    assert calls == [], "get_adjustments should not be called for anonymous request"
