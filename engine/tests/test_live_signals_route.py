"""Tests for GET /live-signals and POST /live-signals/verdict — W-0092."""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import live_signals as live_signals_mod
from research.live_monitor import LiveScanResult


def _make_result(symbol: str, phase: str = "ACCUMULATION") -> LiveScanResult:
    return LiveScanResult(
        symbol=symbol,
        phase=phase,
        path=f"FAKE_DUMP→REAL_DUMP→{phase}",
        entry_hit=phase == "ACCUMULATION",
        fwd_peak_pct=10.5 if phase == "ACCUMULATION" else None,
        realistic_pct=10.2 if phase == "ACCUMULATION" else None,
        phase_fidelity=0.85,
        scanned_at=datetime(2026, 4, 19, 12, 0, 0, tzinfo=timezone.utc),
    )


def _make_client() -> TestClient:
    """Minimal FastAPI app with only the live_signals router (no host middleware)."""
    mini = FastAPI()
    mini.include_router(live_signals_mod.router, prefix="/live-signals")
    return TestClient(mini)


@pytest.fixture(autouse=True)
def reset_cache():
    live_signals_mod._cache_result = None
    live_signals_mod._cache_ts = 0.0
    yield
    live_signals_mod._cache_result = None
    live_signals_mod._cache_ts = 0.0


# ---------------------------------------------------------------------------
# GET /live-signals
# ---------------------------------------------------------------------------

def test_get_live_signals_returns_correct_shape():
    mock_results = [_make_result("KOMAUSDT"), _make_result("TIAUSDT", "REAL_DUMP")]
    with patch.object(live_signals_mod, "scan_all_patterns_live", return_value=mock_results):
        resp = _make_client().get("/live-signals")
    assert resp.status_code == 200
    data = resp.json()
    assert "signals" in data
    assert "cached" in data
    assert "scanned_at" in data
    assert len(data["signals"]) == 2
    assert data["signals"][0]["symbol"] == "KOMAUSDT"
    assert data["signals"][0]["phase"] == "ACCUMULATION"
    assert data["cached"] is False


def test_get_live_signals_cache_hit():
    mock_results = [_make_result("KOMAUSDT")]
    client = _make_client()
    with patch.object(live_signals_mod, "scan_all_patterns_live", return_value=mock_results) as mock_scan:
        client.get("/live-signals")           # populates cache
        resp = client.get("/live-signals")    # should hit cache
    assert resp.status_code == 200
    assert resp.json()["cached"] is True
    assert mock_scan.call_count == 1


def test_get_live_signals_cache_expired():
    mock_results = [_make_result("KOMAUSDT")]
    client = _make_client()
    with patch.object(live_signals_mod, "scan_all_patterns_live", return_value=mock_results) as mock_scan:
        client.get("/live-signals")
        live_signals_mod._cache_ts = time.monotonic() - live_signals_mod._CACHE_TTL - 1
        resp = client.get("/live-signals")
    assert resp.status_code == 200
    assert resp.json()["cached"] is False
    assert mock_scan.call_count == 2


# ---------------------------------------------------------------------------
# POST /live-signals/verdict
# ---------------------------------------------------------------------------

def test_post_verdict_writes_to_file(tmp_path):
    verdicts_file = tmp_path / "verdicts.jsonl"
    original_path = live_signals_mod._VERDICTS_PATH
    live_signals_mod._VERDICTS_PATH = verdicts_file

    try:
        payload = {
            "signal_id": "KOMAUSDT_2026-04-19T12:00:00+00:00",
            "symbol": "KOMAUSDT",
            "phase": "ACCUMULATION",
            "verdict": "valid",
            "note": "classic accumulation structure",
        }
        resp = _make_client().post("/live-signals/verdict", json=payload)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        lines = verdicts_file.read_text().strip().splitlines()
        assert len(lines) == 1
        record = json.loads(lines[0])
        assert record["symbol"] == "KOMAUSDT"
        assert record["verdict"] == "valid"
        assert record["note"] == "classic accumulation structure"
        assert "recorded_at" in record
    finally:
        live_signals_mod._VERDICTS_PATH = original_path


def test_post_verdict_appends_multiple(tmp_path):
    verdicts_file = tmp_path / "verdicts.jsonl"
    original_path = live_signals_mod._VERDICTS_PATH
    live_signals_mod._VERDICTS_PATH = verdicts_file

    try:
        client = _make_client()
        for verdict in ["valid", "invalid", "late"]:
            client.post("/live-signals/verdict", json={
                "signal_id": f"SYM_{verdict}",
                "symbol": "TESTUSDT",
                "phase": "ACCUMULATION",
                "verdict": verdict,
            })
        lines = verdicts_file.read_text().strip().splitlines()
        assert len(lines) == 3
    finally:
        live_signals_mod._VERDICTS_PATH = original_path
