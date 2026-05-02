"""W-0387 — /agent/save route + save_runtime unit tests (8 tests)."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

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


def _mock_save_env(monkeypatch, sb_data=None, sb_raises=False):
    """Patch LLM + Supabase for save tests."""
    monkeypatch.setattr(
        "api.routes.agent.generate_llm_text",
        AsyncMock(return_value="BTC 4h 강세 진입 — RSI 과매도 반등 기대"),
    )
    monkeypatch.setattr("api.routes.agent._log_interaction", lambda *a, **k: None)

    mock_sb = MagicMock()
    if sb_raises:
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.side_effect = Exception("DB down")
        mock_sb.table.return_value.insert.return_value.execute.side_effect = Exception("DB down")
    else:
        existing_data = sb_data if sb_data is not None else []
        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = existing_data
        mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock()

    monkeypatch.setattr("api.routes.agent._sb", lambda: mock_sb)
    return mock_sb


_SAVE_BODY = {
    "symbol": "BTCUSDT",
    "timeframe": "4h",
    "snapshot": {"rsi": 28.5, "avg_volume_ratio": 2.1},
    "decision": {"verdict": "bullish", "entry": 65000.0, "stop": 63000.0, "target": 70000.0, "p_win": 0.62},
    "trigger_origin": "agent_judge",
    "user_id": "user-abc-123",
}


# ── 1. 신규 INSERT 정상 흐름 ──────────────────────────────────────────────────

def test_save_new_insert(client, monkeypatch):
    _mock_save_env(monkeypatch, sb_data=[])
    res = client.post("/agent/save", json=_SAVE_BODY)
    assert res.status_code == 200
    body = res.json()
    assert body["dup_of"] is None
    assert len(body["capture_id"]) > 0
    assert body["cmd"] == "save"
    assert body["reason_summary"] is not None


# ── 2. dup 반환 ──────────────────────────────────────────────────────────────

def test_save_returns_dup(client, monkeypatch):
    _mock_save_env(monkeypatch, sb_data=[{"id": "existing-capture-id"}])
    res = client.post("/agent/save", json=_SAVE_BODY)
    assert res.status_code == 200
    body = res.json()
    assert body["dup_of"] == "existing-capture-id"
    assert body["capture_id"] == "existing-capture-id"


# ── 3. LLM reason 실패 시에도 INSERT 진행 ────────────────────────────────────

def test_save_proceeds_when_reason_llm_fails(client, monkeypatch):
    monkeypatch.setattr(
        "api.routes.agent.generate_llm_text",
        AsyncMock(side_effect=Exception("LLM timeout")),
    )
    monkeypatch.setattr("api.routes.agent._log_interaction", lambda *a, **k: None)
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock()
    monkeypatch.setattr("api.routes.agent._sb", lambda: mock_sb)

    res = client.post("/agent/save", json=_SAVE_BODY)
    assert res.status_code == 200
    body = res.json()
    assert body["reason_summary"] is None
    assert len(body["capture_id"]) > 0


# ── 4. Supabase down 502 ─────────────────────────────────────────────────────

def test_save_supabase_down_still_returns(client, monkeypatch):
    _mock_save_env(monkeypatch, sb_raises=True)
    # Should not 500 — promote_capture catches DB errors
    res = client.post("/agent/save", json=_SAVE_BODY)
    # Returns 200 with a generated capture_id (insert failed silently)
    assert res.status_code == 200


# ── 5. user_id 없으면 400 ───────────────────────────────────────────────────

def test_save_requires_user_id(client, monkeypatch):
    _mock_save_env(monkeypatch)
    body_no_uid = {**_SAVE_BODY, "user_id": None}
    res = client.post("/agent/save", json=body_no_uid)
    assert res.status_code == 400


# ── 6. evidence_hash 안정성 — 동일 입력은 동일 해시 ──────────────────────────

def test_evidence_hash_stable():
    from agents.save_runtime import _evidence_hash
    snap = {"rsi": 28.5, "avg_volume_ratio": 2.1}
    dec = {"verdict": "bullish", "entry": 65000.0, "stop": 63000.0, "target": 70000.0}
    h1 = _evidence_hash(snap, dec)
    h2 = _evidence_hash(snap, dec)
    assert h1 == h2
    assert len(h1) == 32


# ── 7. evidence_hash — 순서 무관 동일 해시 ──────────────────────────────────

def test_evidence_hash_order_independent():
    from agents.save_runtime import _evidence_hash
    snap_a = {"rsi": 28.5, "avg_volume_ratio": 2.1}
    snap_b = {"avg_volume_ratio": 2.1, "rsi": 28.5}
    dec = {"verdict": "bullish", "entry": 100.0, "stop": 95.0, "target": 110.0}
    assert _evidence_hash(snap_a, dec) == _evidence_hash(snap_b, dec)


# ── 8. log verdict mapping bearish → sell ─────────────────────────────────

def test_save_log_verdict_mapping(client, monkeypatch):
    logged: list[str] = []

    def _capture_log(cmd, args, resp, lat, prov, err, uid, llm_verdict, *a, **k):
        if cmd == "save":
            logged.append(llm_verdict)

    # asyncio.to_thread is used for both promote_capture and _log_interaction;
    # running them inline ensures the fire-and-forget log call completes before
    # the TestClient (sync) returns, avoiding a race condition in CI.
    async def _inline_to_thread(fn, *args, **kwargs):
        return fn(*args, **kwargs)

    monkeypatch.setattr(
        "api.routes.agent.generate_llm_text",
        AsyncMock(return_value="ETH 매도 진입"),
    )
    monkeypatch.setattr("api.routes.agent._log_interaction", _capture_log)
    monkeypatch.setattr("asyncio.to_thread", _inline_to_thread)
    mock_sb = MagicMock()
    mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    mock_sb.table.return_value.insert.return_value.execute.return_value = MagicMock()
    monkeypatch.setattr("api.routes.agent._sb", lambda: mock_sb)

    body = {**_SAVE_BODY, "decision": {"verdict": "bearish", "entry": 3000.0, "stop": 3050.0, "target": 2900.0}}
    client.post("/agent/save", json=body)
    assert logged == ["sell"]
