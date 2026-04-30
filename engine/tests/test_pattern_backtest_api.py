"""Tests for GET /patterns/{slug}/backtest — W-0369 Phase 1."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import patterns as pattern_routes
from research.backtest import BacktestResult, BacktestSignal


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_signal(ret_72h: float, target_hit: bool = False) -> BacktestSignal:
    return BacktestSignal(
        symbol="BTCUSDT",
        pattern_slug="test-pattern-v1",
        entry_time=datetime(2025, 1, 1, tzinfo=timezone.utc),
        entry_price=100.0,
        fwd_return_24h=ret_72h / 3,
        fwd_return_48h=ret_72h * 2 / 3,
        fwd_return_72h=ret_72h,
        fwd_peak_pct=abs(ret_72h) * 1.2,
        target_hit=target_hit,
    )


def _make_result(signals: list[BacktestSignal]) -> BacktestResult:
    return BacktestResult(
        pattern_slug="test-pattern-v1",
        timeframe="1h",
        universe_size=10,
        since=datetime(2025, 1, 1, tzinfo=timezone.utc),
        forward_bars=72,
        target_pct=0.05,
        signals=signals,
    )


# ── unit: BacktestResult properties ──────────────────────────────────────────

class TestBacktestResultProperties:
    def test_equity_curve_compounding(self):
        sigs = [_make_signal(0.10), _make_signal(-0.05), _make_signal(0.20)]
        r = _make_result(sigs)
        curve = r.equity_curve
        assert curve[0] == 1.0
        assert abs(curve[1] - 1.10) < 1e-9
        assert abs(curve[2] - 1.10 * 0.95) < 1e-9
        assert abs(curve[3] - 1.10 * 0.95 * 1.20) < 1e-9

    def test_equity_curve_empty_when_no_signals(self):
        r = _make_result([])
        assert r.equity_curve == []

    def test_total_return_multiplicative_not_additive(self):
        sigs = [_make_signal(0.10), _make_signal(0.10)]
        r = _make_result(sigs)
        assert abs(r.total_return - 0.21) < 1e-9   # 1.1 × 1.1 - 1, not 0.20

    def test_apr_formula_accuracy(self):
        sigs = [_make_signal(0.10)] * 15
        r = _make_result(sigs)
        tr = r.total_return
        obs_days = (datetime.now(timezone.utc) - r.since).days
        expected_apr = (1 + tr) ** (365 / obs_days) - 1
        assert r.apr is not None
        assert abs(r.apr - expected_apr) < 1e-6

    def test_apr_none_when_obs_days_lt_30(self):
        from datetime import timedelta
        r = _make_result([_make_signal(0.10)] * 5)
        r.since = datetime.now(timezone.utc) - timedelta(days=20)
        assert r.apr is None

    def test_sharpe_annualised(self):
        sigs = [_make_signal(r) for r in [0.05, 0.10, 0.03, 0.07, 0.06]]
        r = _make_result(sigs)
        sharpe = r.sharpe
        assert sharpe is not None
        assert sharpe > 0

    def test_sharpe_none_when_lt_3_signals(self):
        r = _make_result([_make_signal(0.10), _make_signal(0.05)])
        assert r.sharpe is None

    def test_sharpe_none_when_zero_std(self):
        # Identical returns with tiny float perturbation → std < 1e-10 → None
        vals = [0.05 + i * 1e-15 for i in range(10)]
        sigs = [_make_signal(v) for v in vals]
        r = _make_result(sigs)
        assert r.sharpe is None


# ── route tests ───────────────────────────────────────────────────────────────

def _request(signals: list[BacktestSignal], path: str = "/patterns/test-pattern-v1/backtest") -> dict:
    """Make a request with mocked get_pattern + run_pattern_backtest active."""
    result = _make_result(signals)
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    client = TestClient(app, raise_server_exceptions=True)

    def _noop_get_pattern(slug: str):
        pass  # valid slug — no exception

    with (
        patch.object(pattern_routes, "get_pattern", side_effect=_noop_get_pattern),
        patch("research.backtest.run_pattern_backtest", return_value=result),
    ):
        return client.get(path)


class TestBacktestRoute:
    def test_happy_path_returns_expected_keys(self):
        sigs = [_make_signal(r) for r in [0.05, 0.10, -0.02, 0.08, 0.03,
                                           0.07, -0.01, 0.09, 0.04, 0.06,
                                           0.02, 0.11]]
        resp = _request(sigs)
        assert resp.status_code == 200
        data = resp.json()
        for key in ("slug", "n_signals", "win_rate", "sharpe", "apr", "equity_curve", "insufficient_data"):
            assert key in data, f"missing key: {key}"

    def test_equity_curve_in_response(self):
        sigs = [_make_signal(0.05)] * 12
        data = _request(sigs).json()
        assert isinstance(data["equity_curve"], list)
        assert len(data["equity_curve"]) == 13   # 1 + n_signals

    def test_insufficient_data_flag_when_lt_10_signals(self):
        data = _request([_make_signal(0.05)] * 5).json()
        assert data["insufficient_data"] is True

    def test_insufficient_data_false_when_gte_10_signals(self):
        data = _request([_make_signal(0.05)] * 10).json()
        assert data["insufficient_data"] is False

    def test_empty_signals_returns_nulls(self):
        data = _request([]).json()
        assert data["n_signals"] == 0
        assert data["win_rate"] is None
        assert data["sharpe"] is None
        assert data["apr"] is None
        assert data["equity_curve"] == []

    def test_unknown_slug_returns_404(self):
        app = FastAPI()
        app.include_router(pattern_routes.router, prefix="/patterns")
        client = TestClient(app)

        def _raises(slug: str):
            raise KeyError(slug)

        with patch.object(pattern_routes, "get_pattern", side_effect=_raises):
            resp = client.get("/patterns/unknown-slug/backtest")
        assert resp.status_code == 404

    def test_default_tf_is_1h(self):
        data = _request([_make_signal(0.05)] * 10).json()
        assert data["timeframe"] == "1h"
