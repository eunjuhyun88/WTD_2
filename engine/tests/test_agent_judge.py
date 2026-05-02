"""W-0387 — /agent/judge route + judge_runtime unit tests (7 tests)."""
from __future__ import annotations

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


def _mock_judge_llm(monkeypatch, response: str):
    monkeypatch.setattr(
        "api.routes.agent.generate_llm_text",
        AsyncMock(return_value=response),
    )
    monkeypatch.setattr("api.routes.agent._log_interaction", lambda *a, **k: None)


# ── 1. bullish 정상 판정 ─────────────────────────────────────────────────────

def test_judge_bullish_normal(client, monkeypatch):
    _mock_judge_llm(monkeypatch, '{"verdict":"bullish","entry":65000,"stop":63000,"target":70000,"p_win":0.62,"rationale":"RSI 과매도 + ALPHA"}')
    res = client.post("/agent/judge", json={
        "symbol": "BTCUSDT",
        "timeframe": "4h",
        "indicator_snapshot": {"rsi": 28.5, "avg_volume_ratio": 2.2},
        "last_price": 65100.0,
    })
    assert res.status_code == 200
    body = res.json()
    assert body["verdict"] == "bullish"
    assert body["entry"] == 65000.0
    assert body["stop"] == 63000.0
    assert body["target"] == 70000.0
    assert abs(body["rr"] - 2.5) < 0.01  # (70000-65000)/(65000-63000)
    assert body["p_win"] == pytest.approx(0.62)
    assert body["cmd"] == "judge"


# ── 2. neutral fallback (LLM returns garbage) ───────────────────────────────

def test_judge_neutral_fallback_on_bad_json(client, monkeypatch):
    _mock_judge_llm(monkeypatch, "죄송합니다, 분석이 어렵습니다.")
    res = client.post("/agent/judge", json={
        "symbol": "ETHUSDT",
        "timeframe": "1h",
        "indicator_snapshot": {"rsi": 50.0},
    })
    assert res.status_code == 200
    body = res.json()
    assert body["verdict"] == "neutral"
    assert body["entry"] is None
    assert body["rr"] is None


# ── 3. parse_verdict — JSON extraction ──────────────────────────────────────

def test_parse_verdict_extracts_json_from_text():
    from agents.judge_runtime import parse_verdict
    raw = 'Here is my analysis:\n{"verdict":"bearish","entry":null,"stop":null,"target":null,"p_win":0.40,"rationale":"과매수"}\nDone.'
    result = parse_verdict(raw)
    assert result["verdict"] == "bearish"
    assert result["p_win"] == pytest.approx(0.40)


# ── 4. code-fence stripped ───────────────────────────────────────────────────

def test_parse_verdict_strips_code_fence():
    from agents.judge_runtime import parse_verdict
    raw = '```json\n{"verdict":"bullish","entry":1.5,"stop":1.4,"target":1.7,"p_win":0.6,"rationale":"ok"}\n```'
    result = parse_verdict(raw)
    assert result["verdict"] == "bullish"
    assert result["entry"] == pytest.approx(1.5)


# ── 5. p_win clamping ────────────────────────────────────────────────────────

def test_parse_verdict_clamps_p_win():
    from agents.judge_runtime import parse_verdict
    raw = '{"verdict":"bullish","entry":100,"stop":90,"target":130,"p_win":1.5,"rationale":"over"}'
    result = parse_verdict(raw)
    assert result["p_win"] == pytest.approx(1.0)

    raw2 = '{"verdict":"neutral","entry":null,"stop":null,"target":null,"p_win":-0.3,"rationale":"neg"}'
    result2 = parse_verdict(raw2)
    assert result2["p_win"] == pytest.approx(0.0)


# ── 6. log verdict mapping bullish → buy ────────────────────────────────────

def test_judge_log_verdict_mapping(client, monkeypatch):
    logged: list[str] = []

    def _capture_log(cmd, args, resp, lat, prov, err, uid, llm_verdict, *a, **k):
        logged.append(llm_verdict)

    monkeypatch.setattr("api.routes.agent.generate_llm_text",
                        AsyncMock(return_value='{"verdict":"bullish","entry":100,"stop":95,"target":115,"p_win":0.6,"rationale":"x"}'))
    monkeypatch.setattr("api.routes.agent._log_interaction", _capture_log)

    client.post("/agent/judge", json={
        "symbol": "BTCUSDT",
        "timeframe": "4h",
        "indicator_snapshot": {"rsi": 40.0},
    })
    assert logged == ["buy"]


# ── 7. rr=None when entry==stop ──────────────────────────────────────────────

def test_compute_rr_none_when_zero_risk():
    from agents.judge_runtime import compute_rr
    assert compute_rr(100.0, 100.0, 120.0) is None
    assert compute_rr(None, 90.0, 110.0) is None
    assert compute_rr(100.0, None, 110.0) is None
