"""W-0361: Unit tests for autoresearch_runner.py.

Tests run without Supabase (mocked) or AUTORESEARCH_ENABLED flag.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

# ── AC5: OOS wiring off → aborted ──────────────────────────────────────────


def test_oos_wiring_off_returns_aborted(monkeypatch):
    monkeypatch.setenv("AUTORESEARCH_ENABLED", "true")
    monkeypatch.setenv("RESEARCH_OOS_WIRING", "off")
    from research import autoresearch_runner
    # Reload to pick up env changes
    import importlib
    importlib.reload(autoresearch_runner)
    result = autoresearch_runner.run_once()
    assert result["status"] == "aborted"
    assert result["reason"] == "oos_wiring_off"


def test_autoresearch_disabled_returns_disabled(monkeypatch):
    monkeypatch.setenv("AUTORESEARCH_ENABLED", "false")
    from research import autoresearch_runner
    import importlib
    importlib.reload(autoresearch_runner)
    result = autoresearch_runner.run_once()
    assert result["status"] == "disabled"


# ── AC6: dedup guard ────────────────────────────────────────────────────────


def test_duplicate_run_skipped(monkeypatch):
    monkeypatch.setenv("AUTORESEARCH_ENABLED", "true")
    monkeypatch.setenv("RESEARCH_OOS_WIRING", "on")
    from research import autoresearch_runner
    import importlib
    importlib.reload(autoresearch_runner)
    with patch.object(autoresearch_runner, "_is_duplicate_run", return_value=True):
        result = autoresearch_runner.run_once()
    assert result["status"] == "skipped"
    assert result["reason"] == "duplicate"


# ── four_hour_bucket ────────────────────────────────────────────────────────


def test_four_hour_bucket_truncates():
    from research.autoresearch_runner import _four_hour_bucket
    dt = datetime(2026, 5, 1, 13, 47, 22, tzinfo=timezone.utc)
    bucket = _four_hour_bucket(dt)
    assert bucket.hour == 12
    assert bucket.minute == 0
    assert bucket.second == 0


def test_four_hour_bucket_boundary():
    from research.autoresearch_runner import _four_hour_bucket
    dt = datetime(2026, 5, 1, 16, 0, 0, tzinfo=timezone.utc)
    bucket = _four_hour_bucket(dt)
    assert bucket.hour == 16


# ── _promote_signals with mock data ─────────────────────────────────────────


def test_promote_signals_empty_df_returns_zero():
    import pandas as pd
    from research.autoresearch_runner import _promote_signals

    mock_result = MagicMock()
    mock_result.top_patterns = pd.DataFrame()

    mock_c = MagicMock()
    written = _promote_signals(mock_c, "test-run-id", mock_result, datetime.now(timezone.utc))
    assert written == 0
    mock_c.table.assert_not_called()


def test_promote_signals_writes_rows(monkeypatch):
    import pandas as pd
    from research.autoresearch_runner import _promote_signals

    monkeypatch.setenv("AUTORESEARCH_PROMOTE_CAP", "50")

    # Both rows have sharpe >= PROMOTE_SHARPE (0.7)
    df = pd.DataFrame([
        {"symbol": "BTCUSDT", "pattern": "bull_breakout", "sharpe": 1.2,
         "win_rate": 0.60, "n_executed": 45, "expectancy_pct": 0.8, "max_drawdown_pct": 0.12},
        {"symbol": "ETHUSDT", "pattern": "ema_pullback", "sharpe": 0.9,
         "win_rate": 0.55, "n_executed": 32, "expectancy_pct": 0.5, "max_drawdown_pct": 0.15},
    ])
    mock_result = MagicMock()
    mock_result.top_patterns = df

    mock_c = MagicMock()
    mock_c.table.return_value.upsert.return_value = MagicMock()

    written = _promote_signals(mock_c, "run-123", mock_result, datetime.now(timezone.utc))

    assert written == 2
    mock_c.table.assert_called_with("pattern_signals")


# ── parquet_provider ────────────────────────────────────────────────────────


def test_parquet_provider_local_returns_store(monkeypatch, tmp_path):
    monkeypatch.delenv("GCS_BUCKET", raising=False)
    from data import parquet_provider
    import importlib
    importlib.reload(parquet_provider)
    store = parquet_provider.get_store()
    from data_cache.parquet_store import ParquetStore
    assert isinstance(store, ParquetStore)


# ── API: GET /research/signals schema ───────────────────────────────────────


def test_signals_lookback_parse_bad_format():
    from fastapi.testclient import TestClient
    from fastapi import FastAPI
    from api.routes.research import router
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app, raise_server_exceptions=False)
    # Requires Supabase env — just confirm 400 or 500 (not 200)
    resp = client.get("/signals/BTCUSDT", params={"lookback": "bad"})
    assert resp.status_code in (400, 422, 500)


def test_signals_route_registered():
    from api.routes.research import router
    paths = [r.path for r in router.routes]
    assert any("signals" in p for p in paths)
    assert any("runs" in p for p in paths)
    assert any("autoresearch/trigger" in p for p in paths)
