from __future__ import annotations

from datetime import datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import patterns as pattern_routes
from ledger.types import PatternLedgerRecord


class _FakeLedgerStore:
    def __init__(self, records: list[PatternLedgerRecord]):
        self._records = records

    def list(self, slug: str, *, record_type: str | None = None, **_) -> list[PatternLedgerRecord]:
        return [
            record
            for record in self._records
            if record.pattern_slug == slug
            and (record_type is None or record.record_type == record_type)
        ]


def _outcome(slug: str, outcome: str, exit_return_pct: float) -> PatternLedgerRecord:
    return PatternLedgerRecord(
        pattern_slug=slug,
        record_type="outcome",
        symbol="BTCUSDT",
        created_at=datetime(2026, 4, 30),
        payload={
            "outcome": outcome,
            "exit_return_pct": exit_return_pct,
            "duration_hours": 4.0,
            "max_gain_pct": max(exit_return_pct, 0.0),
        },
    )


def test_verify_paper_route_returns_ledger_based_gate_metrics(monkeypatch) -> None:
    slug = "tradoor-oi-reversal-v1"
    records = [_outcome(slug, "hit", 0.04) for _ in range(7)]
    records += [_outcome(slug, "miss", -0.02) for _ in range(3)]
    records.append(_outcome(slug, "expired", 0.0))
    records.append(_outcome("other-pattern", "miss", -0.05))
    monkeypatch.setattr(pattern_routes, "LEDGER_RECORD_STORE", _FakeLedgerStore(records))

    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app)

    response = client.post(f"/patterns/{slug}/verify-paper")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["pattern_slug"] == slug
    assert body["n_trades"] == 11
    assert body["n_hit"] == 7
    assert body["n_miss"] == 3
    assert body["n_expired"] == 1
    assert body["win_rate"] == 0.7
    assert body["pass_gate"] is True
    assert body["gate_reasons"] == []
