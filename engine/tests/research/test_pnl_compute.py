"""Unit tests for W-0365 pnl_compute — 8+ cases covering long/short × exit_reason."""
from __future__ import annotations

import pandas as pd
import pytest

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pnl.cost_model import DEFAULT_TIER, CostTier, get_cost_tier
from pnl.pnl_compute import simulate_trade, Verdict


def _make_ohlcv(rows: list[tuple[float, float, float, float]]) -> pd.DataFrame:
    """rows: list of (open, high, low, close)"""
    df = pd.DataFrame(rows, columns=['open', 'high', 'low', 'close'])
    df.index = pd.date_range('2024-01-01', periods=len(df), freq='1h', tz='UTC')
    return df


# ── Cost model ──────────────────────────────────────────────────────────────

def test_default_tier_is_15bps():
    assert DEFAULT_TIER.total_bps == 15.0


def test_cost_tiers():
    assert get_cost_tier('BTC', vol_rank=1).label == 'high'
    assert get_cost_tier('BTC', vol_rank=100).label == 'mid'
    assert get_cost_tier('BTC', vol_rank=500).label == 'low'
    assert get_cost_tier('BTC', vol_rank=None).label == 'mid'


# ── Long trades ──────────────────────────────────────────────────────────────

def test_long_target_hit_win():
    # Bar 0: entry setup, Bar 1: open=100, Bar 2: high=120 → target hit
    ohlcv = _make_ohlcv([
        (98, 102, 97, 100),   # bar 0 (entry bar)
        (100, 105, 99, 103),  # bar 1 (entry open=100)
        (103, 125, 102, 120), # bar 2 (target hit at 120)
    ])
    r = simulate_trade(ohlcv, entry_bar_idx=0, direction=1, stop_px=90, target_px=120, horizon_bars=5)
    assert r.exit_reason == 'target'
    assert r.exit_px == 120.0
    assert r.pnl_bps_gross == pytest.approx(2000.0, abs=1)  # (120/100-1)*10000
    assert r.pnl_bps_net == pytest.approx(2000.0 - 15.0, abs=1)
    assert r.verdict == 'WIN'


def test_long_stop_hit_loss():
    ohlcv = _make_ohlcv([
        (98, 102, 97, 100),
        (100, 101, 88, 90),   # bar 1: low=88 < stop=92 → stop hit
        (90, 95, 89, 93),
    ])
    r = simulate_trade(ohlcv, entry_bar_idx=0, direction=1, stop_px=92, target_px=120, horizon_bars=5)
    assert r.exit_reason == 'stop'
    assert r.exit_px == 92.0
    gross = (92 / 100 - 1) * 10000  # -800 bps
    assert r.pnl_bps_gross == pytest.approx(gross, abs=1)
    assert r.verdict == 'LOSS'


def test_long_timeout_win():
    rows = [(100, 101, 99, 100)] * 1 + [(100, 101, 99, 115)] * 5  # timeout at close=115
    ohlcv = _make_ohlcv(rows)
    r = simulate_trade(ohlcv, entry_bar_idx=0, direction=1, stop_px=80, target_px=130, horizon_bars=5)
    assert r.exit_reason == 'timeout'
    assert r.verdict == 'WIN'


def test_long_timeout_indeterminate_in_cost_band():
    # Timeout with tiny move (< 15bps = <1.5 points from 100)
    rows = [(100, 101, 99, 100)] * 1 + [(100, 100.1, 99.9, 100.1)] * 5
    ohlcv = _make_ohlcv(rows)
    r = simulate_trade(ohlcv, entry_bar_idx=0, direction=1, stop_px=90, target_px=110, horizon_bars=5)
    assert r.exit_reason == 'timeout'
    assert r.verdict == 'INDETERMINATE'


# ── Short trades ──────────────────────────────────────────────────────────────

def test_short_target_hit_win():
    ohlcv = _make_ohlcv([
        (100, 102, 98, 100),
        (100, 101, 99, 100),  # entry open=100
        (99, 100, 82, 85),    # low=82 → target hit at 85
    ])
    r = simulate_trade(ohlcv, entry_bar_idx=0, direction=-1, stop_px=115, target_px=85, horizon_bars=5)
    assert r.exit_reason == 'target'
    assert r.exit_px == 85.0
    gross = (85 / 100 - 1) * 10000 * (-1)  # +1500 bps
    assert r.pnl_bps_gross == pytest.approx(gross, abs=1)
    assert r.verdict == 'WIN'


def test_short_stop_hit_loss():
    ohlcv = _make_ohlcv([
        (100, 102, 98, 100),
        (100, 118, 99, 115),  # high=118 > stop=110 → stop
        (115, 116, 114, 115),
    ])
    r = simulate_trade(ohlcv, entry_bar_idx=0, direction=-1, stop_px=110, target_px=80, horizon_bars=5)
    assert r.exit_reason == 'stop'
    assert r.exit_px == 110.0
    assert r.verdict == 'LOSS'


def test_short_timeout_loss():
    rows = [(100, 101, 99, 100)] + [(100, 106, 99, 105)] * 5  # close rises → short loss
    ohlcv = _make_ohlcv(rows)
    r = simulate_trade(ohlcv, entry_bar_idx=0, direction=-1, stop_px=120, target_px=80, horizon_bars=5)
    assert r.exit_reason == 'timeout'
    assert r.verdict == 'LOSS'


def test_gap_indeterminate():
    ohlcv = _make_ohlcv([
        (100, 102, 98, 100),
        (101.5, 105, 101, 103),  # open=101.5, prev_close=100 → gap=1.5% > 0.5%
    ])
    r = simulate_trade(ohlcv, entry_bar_idx=0, direction=1, stop_px=90, target_px=120, horizon_bars=5)
    assert r.verdict == 'INDETERMINATE'
    assert r.exit_reason == 'indeterminate_gap'


def test_stop_priority_over_target_same_bar():
    # Same bar: low hits stop AND high hits target → stop wins (conservative)
    ohlcv = _make_ohlcv([
        (100, 102, 98, 100),
        (100, 130, 85, 110),   # high=130 ≥ target=120, low=85 ≤ stop=90 → stop wins
    ])
    r = simulate_trade(ohlcv, entry_bar_idx=0, direction=1, stop_px=90, target_px=120, horizon_bars=5)
    assert r.exit_reason == 'stop'
