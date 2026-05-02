"""W-0378 Phase 1: Agent route smoke tests.

Tests validate:
- /agent/explain responds with text + cmd=explain
- /agent/alpha-scan responds with text + cmd=scan
- /agent/similar handles None win_rate/avg_pnl and None forward_pnl_4h (D2/D3 fix)
- external_enrichment degrades gracefully without EXA_API_KEY (AC15)
- external_enrichment helpers: extract_symbol_base, detect_risk_news
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    from fastapi import FastAPI
    from api.routes.agent import router
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _mock_llm(monkeypatch):
    """Patch generate_llm_text to return a fixed Korean verdict string."""
    monkeypatch.setattr(
        "api.routes.agent.generate_llm_text",
        AsyncMock(return_value="테스트 분석: RSI 과매수 신호. 관망 권장."),
    )
    monkeypatch.setattr(
        "api.routes.agent._log_interaction",
        lambda *args, **kwargs: None,
    )


# ── /agent/explain ─────────────────────────────────────────────────────────────

def test_explain_basic(client, monkeypatch):
    _mock_llm(monkeypatch)
    monkeypatch.setattr(
        "api.routes.agent.fetch_news_context",
        AsyncMock(return_value=[]),
    )
    res = client.post("/agent/explain", json={
        "symbol": "ETHUSDT",
        "timeframe": "4h",
        "indicator_snapshot": {"rsi": 72.5, "avg_volume_ratio": 1.8},
        "anomaly_flags": [{"severity": "high", "description": "volume spike"}],
    })
    assert res.status_code == 200
    body = res.json()
    assert body["cmd"] == "explain"
    assert len(body["text"]) > 0
    assert body["latency_ms"] >= 0


def test_explain_with_alpha_score(client, monkeypatch):
    """D1 fix: alpha_score dict field is accepted without error."""
    _mock_llm(monkeypatch)
    monkeypatch.setattr(
        "api.routes.agent.fetch_news_context",
        AsyncMock(return_value=[]),
    )
    res = client.post("/agent/explain", json={
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "indicator_snapshot": {"rsi": 55.0},
        "anomaly_flags": [],
        "alpha_score": {
            "score": 72,
            "verdict": "ALPHA",
            "signals": [{"label": "oi_surge", "score_delta": 18, "raw_value": 0.85}],
        },
    })
    assert res.status_code == 200
    assert res.json()["cmd"] == "explain"


def test_explain_verdict_extracted(client, monkeypatch):
    """llm_verdict extraction: '관망' in response → _extract_verdict returns 'watch'."""
    from api.routes.agent import _extract_verdict
    assert _extract_verdict("RSI 과매수. 관망 권장.") == "watch"
    assert _extract_verdict("강한 매수 신호.") == "buy"
    assert _extract_verdict("매도 타이밍.") == "sell"
    assert _extract_verdict("알 수 없음.") is None


# ── /agent/alpha-scan ─────────────────────────────────────────────────────────

def test_alpha_scan_basic(client, monkeypatch):
    _mock_llm(monkeypatch)
    res = client.post("/agent/alpha-scan", json={
        "scores": [
            {"symbol": "ETHUSDT", "score": 82, "verdict": "STRONG_ALPHA", "signals": []},
            {"symbol": "BTCUSDT", "score": 65, "verdict": "ALPHA", "signals": []},
            {"symbol": "SOLUSDT", "score": 40, "verdict": "WATCH", "signals": []},
        ],
        "top_n": 3,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["cmd"] == "scan"
    assert len(body["text"]) > 0


def test_alpha_scan_sorted_by_score(client, monkeypatch):
    """Verify high-score symbol appears first in user_text."""
    captured: list[str] = []

    async def _fake_llm(system, user_text, **kw):
        captured.append(user_text)
        return "관망 권장"

    monkeypatch.setattr("api.routes.agent.generate_llm_text", _fake_llm)
    monkeypatch.setattr("api.routes.agent._log_interaction", lambda *a, **kw: None)

    client.post("/agent/alpha-scan", json={
        "scores": [
            {"symbol": "LOW", "score": 20, "verdict": "AVOID"},
            {"symbol": "HIGH", "score": 90, "verdict": "STRONG_ALPHA"},
        ],
        "top_n": 2,
    })
    assert captured, "LLM was not called"
    assert captured[0].index("HIGH") < captured[0].index("LOW")


# ── /agent/similar ────────────────────────────────────────────────────────────

def test_similar_none_win_rate(client, monkeypatch):
    """D3 fix: win_rate=None → 데이터 부족, no TypeError."""
    _mock_llm(monkeypatch)
    res = client.post("/agent/similar", json={
        "symbol": "ETHUSDT",
        "timeframe": "4h",
        "similar": {
            "similar_segments": [],
            "win_rate": None,
            "avg_pnl": None,
            "confidence": "low",
        },
    })
    assert res.status_code == 200
    assert res.json()["cmd"] == "similar"


def test_similar_zero_pnl_not_missing(client, monkeypatch):
    """D2 fix: forward_pnl_4h=0.0 must show '+0.00%', not '미집계'."""
    captured: list[str] = []

    async def _fake_llm(system, user_text, **kw):
        captured.append(user_text)
        return "관망 권장"

    monkeypatch.setattr("api.routes.agent.generate_llm_text", _fake_llm)
    monkeypatch.setattr("api.routes.agent._log_interaction", lambda *a, **kw: None)

    client.post("/agent/similar", json={
        "symbol": "BTCUSDT",
        "timeframe": "4h",
        "similar": {
            "similar_segments": [{
                "symbol": "BTCUSDT",
                "from_ts": "2025-01-01T00:00:00",
                "to_ts": "2025-01-02T00:00:00",
                "similarity_score": 0.85,
                "forward_pnl_4h": 0.0,
            }],
            "win_rate": 0.55,
            "avg_pnl": 0.0,
            "confidence": "medium",
        },
    })
    assert captured
    assert "+0.00%" in captured[0]
    assert "미집계" not in captured[0]


# ── external_enrichment helpers ───────────────────────────────────────────────

def test_extract_symbol_base():
    from agents.external_enrichment import extract_symbol_base
    assert extract_symbol_base("ETHUSDT") == "ETH"
    assert extract_symbol_base("BTC-USD") == "BTC"
    assert extract_symbol_base("ETH-USDC") == "ETH"
    assert extract_symbol_base("SOL") == "SOL"


def test_detect_risk_news():
    from agents.external_enrichment import detect_risk_news
    assert detect_risk_news(["ETH network hack detected"]) is True
    assert detect_risk_news(["SEC lawsuit filed against exchange"]) is True
    assert detect_risk_news(["ETH price rises 5%"]) is False
    assert detect_risk_news([]) is False


def test_fetch_news_no_key():
    """AC15: no EXA_API_KEY → empty list, no exception."""
    import os
    from agents.external_enrichment import fetch_news_context

    orig = os.environ.pop("EXA_API_KEY", None)
    try:
        result = asyncio.get_event_loop().run_until_complete(fetch_news_context("ETH"))
        assert result == []
    finally:
        if orig:
            os.environ["EXA_API_KEY"] = orig
