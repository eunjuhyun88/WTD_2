from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import screener
from screener.pipeline import ScreenerInputRecord, run_screener
from screener.store import ScreenerStore


def _client(tmp_path, monkeypatch) -> TestClient:
    store = ScreenerStore(tmp_path / "screener.sqlite")
    monkeypatch.setattr(screener, "_store", store)
    app = FastAPI()
    app.include_router(screener.router, prefix="/screener")
    client = TestClient(app)
    client.screener_store = store  # type: ignore[attr-defined]
    return client


def _seed(store: ScreenerStore) -> None:
    started_at = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    completed_at = datetime.now(timezone.utc).isoformat()
    run_screener(
        [
            ScreenerInputRecord(
                symbol="GOODUSDT",
                min_mc_usd=7_000_000,
                drawdown_ratio=0.85,
                max_recovery_multiple=2.0,
                adjusted_top10_pct=55.0,
                pattern_phase="ACCUMULATION",
                funding_rate=-0.02,
                oi_change_24h=0.02,
                long_short_ratio=0.85,
            ),
            ScreenerInputRecord(
                symbol="MIDUSDT",
                min_mc_usd=40_000_000,
                drawdown_ratio=0.92,
                max_recovery_multiple=8.0,
                adjusted_top10_pct=40.0,
                pattern_phase="REAL_DUMP",
            ),
        ],
        store=store,
        mode="full",
        started_at=started_at,
        completed_at=completed_at,
    )


def test_latest_run_and_listings(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    _seed(client.screener_store)  # type: ignore[arg-type, attr-defined]

    latest = client.get("/screener/runs/latest")
    assert latest.status_code == 200
    assert latest.json()["run"]["status"] == "completed"

    listings = client.get("/screener/listings", params={"grade": "A"})
    assert listings.status_code == 200
    payload = listings.json()
    assert payload["count"] == 1
    assert payload["listings"][0]["symbol"] == "GOODUSDT"


def test_asset_detail_and_filtered_universe(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    store = client.screener_store  # type: ignore[attr-defined]
    store.save_override(
        scope="symbol_blacklist",
        target="GOODUSDT",
        action="exclude_note",
        reason="manual note",
        author="tester",
        created_at="2026-04-16T00:00:00+00:00",
    )
    _seed(store)

    detail = client.get("/screener/assets/GOODUSDT")
    assert detail.status_code == 200
    assert detail.json()["listing"]["symbol"] == "GOODUSDT"
    assert len(detail.json()["overrides"]) == 1

    universe = client.get("/screener/universe", params={"min_grade": "B"})
    assert universe.status_code == 200
    assert universe.json()["symbols"] == ["GOODUSDT"]
