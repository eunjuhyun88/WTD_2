"""W-0346: Verdict → Personalization Loop tests.

Covers:
  AC1: valid×3 → delta=+0.15, invalid×1 → delta=−0.08
  AC2: weight absolute cap ±1.0
  AC3: verdict_count < 5 → baseline weights (cold start)
  AC4: feedback exception does not affect verdict POST (200 returned)
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from memory.state_store import UserVerdictWeightStore
from memory.rerank import (
    apply_verdict_feedback,
    context_tags_from_outcome,
    score_candidate_with_user_feedback,
)


def _make_store(tmp_path: Path) -> UserVerdictWeightStore:
    return UserVerdictWeightStore(db_path=tmp_path / "weights.db")


# ---------------------------------------------------------------------------
# AC1: delta accumulation
# ---------------------------------------------------------------------------

def test_valid_x3_accumulates_delta(tmp_path):
    store = _make_store(tmp_path)
    user = "user-001"
    # Need ≥5 verdicts for cold-start gate to pass — seed 5 valid first
    for _ in range(5):
        store.apply(user, ["symbol:BTCUSDT"], "valid")
    # Now check accumulated delta: 5 × +0.05 = +0.25
    adj = store.get_adjustments(user)
    assert abs(adj["symbol:BTCUSDT"] - 0.25) < 1e-9


def test_invalid_delta_is_negative(tmp_path):
    store = _make_store(tmp_path)
    user = "user-002"
    # Seed 5 verdicts to pass cold start
    for _ in range(4):
        store.apply(user, ["timeframe:4h"], "valid")
    store.apply(user, ["timeframe:4h"], "invalid")
    adj = store.get_adjustments(user)
    # 4 × +0.05 + 1 × −0.08 = +0.12
    assert abs(adj["timeframe:4h"] - 0.12) < 1e-9


# ---------------------------------------------------------------------------
# AC2: weight cap ±1.0
# ---------------------------------------------------------------------------

def test_weight_cap_positive(tmp_path):
    store = _make_store(tmp_path)
    user = "user-cap-pos"
    # Apply 25 valid (+0.05 each = +1.25 without cap → should be capped at 1.0)
    for _ in range(25):
        store.apply(user, ["symbol:ETHUSDT"], "valid")
    adj = store.get_adjustments(user)
    assert adj["symbol:ETHUSDT"] <= 1.0


def test_weight_cap_negative(tmp_path):
    store = _make_store(tmp_path)
    user = "user-cap-neg"
    # Apply 5 valid first to pass cold-start, then many invalid
    for _ in range(5):
        store.apply(user, ["pattern:tradoor-oi-reversal-v1"], "valid")
    for _ in range(20):
        store.apply(user, ["pattern:tradoor-oi-reversal-v1"], "invalid")
    adj = store.get_adjustments(user)
    assert adj["pattern:tradoor-oi-reversal-v1"] >= -1.0


# ---------------------------------------------------------------------------
# AC3: cold start — n<5 returns empty adjustments
# ---------------------------------------------------------------------------

def test_cold_start_returns_empty(tmp_path):
    store = _make_store(tmp_path)
    user = "user-cold"
    store.apply(user, ["symbol:BTCUSDT"], "valid")
    store.apply(user, ["symbol:BTCUSDT"], "valid")
    # Only 2 verdicts → cold start
    adj = store.get_adjustments(user)
    assert adj == {}


def test_exactly_five_verdicts_exits_cold_start(tmp_path):
    store = _make_store(tmp_path)
    user = "user-5"
    for _ in range(5):
        store.apply(user, ["timeframe:1h"], "valid")
    adj = store.get_adjustments(user)
    assert "timeframe:1h" in adj
    assert adj["timeframe:1h"] > 0


# ---------------------------------------------------------------------------
# context_tags_from_outcome helper
# ---------------------------------------------------------------------------

def test_context_tags_from_outcome():
    tags = context_tags_from_outcome(
        symbol="BTCUSDT", timeframe="4h", pattern_slug="tradoor-oi-reversal-v1"
    )
    assert "symbol:BTCUSDT" in tags
    assert "timeframe:4h" in tags
    assert "pattern:tradoor-oi-reversal-v1" in tags
    assert len(tags) == 3


def test_context_tags_partial():
    tags = context_tags_from_outcome(symbol="ETHUSDT")
    assert tags == ["symbol:ETHUSDT"]


# ---------------------------------------------------------------------------
# score_candidate_with_user_feedback — adjustment applied on top
# ---------------------------------------------------------------------------

def test_user_feedback_boosts_matching_candidate(tmp_path):
    from api.schemas_memory import MemoryCandidate, MemoryContext

    store = _make_store(tmp_path)
    user = "user-score"
    for _ in range(5):
        store.apply(user, ["symbol:BTCUSDT"], "valid")

    candidate = MemoryCandidate(
        id="mem-001",
        kind="experience",
        text="BTC trade",
        base_score=0.5,
        tags=["BTCUSDT", "4h"],
        confidence="observed",
        access_count=0,
    )
    context = MemoryContext(symbol="BTCUSDT", timeframe="4h")

    score_with, reasons_with = score_candidate_with_user_feedback(
        candidate, context, user, weight_store=store
    )
    score_without, _ = score_candidate_with_user_feedback(
        candidate, context, "other-user", weight_store=store
    )
    assert score_with > score_without
    assert any("user_feedback" in r for r in reasons_with)


# ---------------------------------------------------------------------------
# AC4: verdict POST 200 even when feedback raises
# ---------------------------------------------------------------------------

def test_verdict_post_succeeds_even_when_feedback_fails(tmp_path, monkeypatch):
    from api.routes import captures
    from capture.store import CaptureStore
    from capture.types import CaptureRecord
    from ledger.store import LedgerStore
    from ledger.types import PatternOutcome
    from patterns.state_store import PatternStateStore

    capture_store = CaptureStore(tmp_path / "c.db")
    ledger_store = LedgerStore(tmp_path / "ledger")
    state_store = PatternStateStore(tmp_path / "runtime.sqlite")

    monkeypatch.setattr(captures, "_capture_store", capture_store)
    monkeypatch.setattr(captures, "_state_store", state_store)
    monkeypatch.setattr(captures, "_ledger_store", ledger_store)
    monkeypatch.setattr(captures, "LEDGER_RECORD_STORE", type("FRS", (), {
        "append_verdict_record": lambda self, o: None,
    })())

    # Patch feedback to raise
    monkeypatch.setattr("memory.rerank.apply_verdict_feedback", lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("boom")))

    outcome = PatternOutcome(
        pattern_slug="tradoor-oi-reversal-v1",
        symbol="BTCUSDT",
        accumulation_at=datetime.now(tz=timezone.utc),
        entry_price=100.0,
        peak_price=120.0,
        exit_price=120.0,
        outcome="success",
        max_gain_pct=0.20,
        exit_return_pct=0.20,
    )
    ledger_store.save(outcome)

    cap = CaptureRecord(
        symbol="BTCUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        timeframe="1h",
        captured_at_ms=int(time.time() * 1000),
        status="outcome_ready",
        outcome_id=outcome.id,
    )
    capture_store.save(cap)

    app = FastAPI()
    app.include_router(captures.router, prefix="/captures")

    @app.middleware("http")
    async def _inject(request, call_next):
        request.state.user_id = "test-user"
        return await call_next(request)

    client = TestClient(app)
    resp = client.post(
        f"/captures/{cap.capture_id}/verdict",
        json={"verdict": "valid"},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
