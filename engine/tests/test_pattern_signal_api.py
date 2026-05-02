"""W-0370 Phase 1 — GET /patterns/{slug}/signals tests (5 tests)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from fastapi import FastAPI
    from api.routes.patterns import router
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


_SLUG = "rsi_oversold_bounce"

# fetch_recent_signals already flattens outcomes into outcome/pnl_pct fields
_SIGNAL_ROWS = [
    {
        "id": "sig-1",
        "symbol": "BTCUSDT",
        "direction": "bullish",
        "entry_price": 65000.0,
        "fired_at": "2026-04-30T12:00:00+00:00",
        "outcome": "profit_take",
        "pnl_pct": 0.042,
    },
    {
        "id": "sig-2",
        "symbol": "ETHUSDT",
        "direction": "bullish",
        "entry_price": 3000.0,
        "fired_at": "2026-04-29T08:00:00+00:00",
        "outcome": "pending",
        "pnl_pct": None,
    },
]


def _mock_store(monkeypatch, rows):
    monkeypatch.setattr(
        "research.signal_event_store.fetch_recent_signals",
        lambda slug, days=30, limit=20: rows,
    )


def _mock_pattern(monkeypatch, found: bool = True):
    if found:
        monkeypatch.setattr("api.routes.patterns.get_pattern", lambda slug: {"slug": slug})
    else:
        def _raise(slug):
            raise KeyError(slug)
        monkeypatch.setattr("api.routes.patterns.get_pattern", _raise)


# ── 1. 정상 응답 ──────────────────────────────────────────────────────────────

def test_signals_happy_path(client, monkeypatch):
    _mock_pattern(monkeypatch)
    _mock_store(monkeypatch, _SIGNAL_ROWS)
    res = client.get(f"/{_SLUG}/signals")
    assert res.status_code == 200
    body = res.json()
    assert body["slug"] == _SLUG
    assert body["total_count"] == 2
    assert len(body["signals"]) == 2


# ── 2. resolved outcome 정상 매핑 ──────────────────────────────────────────────

def test_signals_resolved_outcome_mapped(client, monkeypatch):
    _mock_pattern(monkeypatch)
    _mock_store(monkeypatch, _SIGNAL_ROWS)
    res = client.get(f"/{_SLUG}/signals")
    sigs = res.json()["signals"]
    resolved = next(s for s in sigs if s["id"] == "sig-1")
    assert resolved["outcome"] == "profit_take"
    assert abs(resolved["pnl_pct"] - 0.042) < 1e-6


# ── 3. unresolved → outcome=pending ──────────────────────────────────────────

def test_signals_unresolved_returns_pending(client, monkeypatch):
    _mock_pattern(monkeypatch)
    _mock_store(monkeypatch, _SIGNAL_ROWS)
    res = client.get(f"/{_SLUG}/signals")
    sigs = res.json()["signals"]
    pending = next(s for s in sigs if s["id"] == "sig-2")
    assert pending["outcome"] == "pending"
    assert pending["pnl_pct"] is None


# ── 4. 존재하지 않는 slug → 404 ──────────────────────────────────────────────

def test_signals_unknown_slug_404(client, monkeypatch):
    _mock_pattern(monkeypatch, found=False)
    res = client.get("/patterns/nonexistent_slug/signals")
    assert res.status_code == 404


# ── 5. 빈 신호 목록 ────────────────────────────────────────────────────────────

def test_signals_empty_list(client, monkeypatch):
    _mock_pattern(monkeypatch)
    _mock_store(monkeypatch, [])
    res = client.get(f"/{_SLUG}/signals")
    assert res.status_code == 200
    body = res.json()
    assert body["total_count"] == 0
    assert body["signals"] == []
