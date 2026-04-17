from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import rag


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(rag.router, prefix="/rag")
    return TestClient(app)


def test_terminal_scan_embedding_route() -> None:
    client = _client()
    res = client.post(
        "/rag/terminal-scan",
        json={
            "signals": [
                {"agentId": "STRUCTURE", "vote": "long", "confidence": 80},
                {"agentId": "FLOW", "vote": "short", "confidence": 60},
            ],
            "timeframe": "4h",
            "dataCompleteness": 0.7,
        },
    )
    assert res.status_code == 200
    payload = res.json()
    assert len(payload["embedding"]) == 256
    assert payload["embedding"][149] == 1
    assert payload["embedding"][255] == 0.7


def test_dedupe_hash_route() -> None:
    client = _client()
    res = client.post(
        "/rag/dedupe-hash",
        json={
            "pair": "BTCUSDT",
            "timeframe": "1h",
            "direction": "LONG",
            "regime": "unknown",
            "source": "signal_action",
            "windowMinutes": 60,
        },
    )
    assert res.status_code == 200
    assert res.json()["dedupeHash"].startswith("dh_")
