from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import patterns as pattern_routes


def test_all_candidates_exposes_legacy_and_rich_records(monkeypatch) -> None:
    monkeypatch.setattr(
        pattern_routes,
        "get_entry_candidates_all",
        lambda: {"tradoor-oi-reversal-v1": ["PTBUSDT"]},
    )
    monkeypatch.setattr(
        pattern_routes,
        "get_entry_candidate_records",
        lambda pattern_slug=None: {
            "tradoor-oi-reversal-v1": [
                {
                    "symbol": "PTBUSDT",
                    "pattern_slug": "tradoor-oi-reversal-v1",
                    "phase": "ACCUMULATION",
                    "transition_id": "transition-1",
                    "candidate_transition_id": "transition-1",
                }
            ]
        },
    )
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.get("/patterns/candidates")

    assert response.status_code == 200
    payload = response.json()
    assert payload["entry_candidates"] == {"tradoor-oi-reversal-v1": ["PTBUSDT"]}
    assert payload["total_count"] == 1
    assert payload["candidate_records"][0]["transition_id"] == "transition-1"
    assert (
        payload["candidate_records_by_pattern"]["tradoor-oi-reversal-v1"][0][
            "candidate_transition_id"
        ]
        == "transition-1"
    )
