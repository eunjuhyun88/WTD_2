"""W-0311 — KellyPolicy unit tests."""
from __future__ import annotations

import pytest

from patterns.risk_policy import (
    FixedStopPolicy,
    KellyPolicy,
    build_risk_policy,
)
from research.validation.regime import RegimeLabel, VolLabel


# ---------------------------------------------------------------------------
# kelly_star
# ---------------------------------------------------------------------------

def test_kelly_star_positive_edge():
    kp = KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)
    assert abs(kp.kelly_star() - 0.4667) < 0.001


def test_kelly_star_negative_edge():
    kp = KellyPolicy(hit_rate=0.20, n_samples=20, rr_ratio=2.0)
    assert kp.kelly_star() < 0


def test_kelly_star_breakeven_zero():
    kp = KellyPolicy(hit_rate=0.25, n_samples=20, rr_ratio=3.0)
    assert abs(kp.kelly_star()) < 1e-9


# ---------------------------------------------------------------------------
# kelly_used
# ---------------------------------------------------------------------------

def test_kelly_used_fractional_quarter():
    kp = KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)
    assert abs(kp.kelly_used() - 0.1167) < 0.001


def test_kelly_used_clamped_at_cap():
    # kelly_star = (10*0.99 - 0.01)/10 = 0.989
    # kelly_fraction * kelly_star = 0.25 * 0.989 = 0.247 > kelly_cap=0.20
    # → kelly_used should be clamped to kelly_cap=0.20
    kp = KellyPolicy(hit_rate=0.99, n_samples=20, rr_ratio=10, kelly_cap=0.20)
    assert kp.kelly_used() == pytest.approx(0.20)


# ---------------------------------------------------------------------------
# build_risk_policy cold-start
# ---------------------------------------------------------------------------

def test_cold_start_fallback_under_min_samples():
    result = build_risk_policy(hit_rate=0.6, n_samples=5)
    assert isinstance(result, FixedStopPolicy)


# ---------------------------------------------------------------------------
# is_active
# ---------------------------------------------------------------------------

def test_is_active_requires_positive_kelly():
    kp = KellyPolicy(hit_rate=0.30, n_samples=20, rr_ratio=2.0)
    # kelly_star = (2*0.30 - 0.70)/2 = (0.60-0.70)/2 = -0.05 < 0
    assert kp.is_active() is False


# ---------------------------------------------------------------------------
# get_position_usdt
# ---------------------------------------------------------------------------

def test_get_position_usdt_basic_AC1():
    kp = KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)
    result = kp.get_position_usdt(1000)
    assert abs(result - 116.7) < 1.0


def test_get_position_usdt_with_regime_bear_AC2():
    kp = KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)
    result = kp.get_position_usdt(1000, regime_mult=0.6)
    assert abs(result - 70.0) < 1.0


def test_get_position_usdt_account_equity_zero_raises():
    kp = KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)
    with pytest.raises(ValueError):
        kp.get_position_usdt(0)


def test_get_position_usdt_below_min_returns_zero():
    # Small equity so that position_usdt < min_position_usdt=50
    kp = KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)
    # kelly_used ~0.1167, equity=100 → 11.67 < 50 → should return 0
    result = kp.get_position_usdt(100)
    assert result == 0.0


# ---------------------------------------------------------------------------
# get_stop_price
# ---------------------------------------------------------------------------

def test_get_stop_price_bull_tight_AC4():
    kp = KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)
    stop = kp.get_stop_price(entry=100.0, atr=1.0, regime=RegimeLabel.BULL)
    # BULL atr_mult=1.2, stop_dist=1.2, min=0.5, max=5.0 → stop=98.8
    assert abs(stop - 98.8) < 0.05


def test_get_stop_price_bear_wide_AC4():
    kp = KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)
    stop = kp.get_stop_price(entry=100.0, atr=1.0, regime=RegimeLabel.BEAR)
    # BEAR atr_mult=2.0, stop_dist=2.0, min=0.5, max=5.0 → stop=98.0
    assert abs(stop - 98.0) < 0.05


def test_get_stop_price_min_pct_guard_AC9():
    kp = KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)
    stop = kp.get_stop_price(entry=100.0, atr=0.01)
    # Default RANGE atr_mult=1.5, stop_dist=0.015 < min_stop_pct*entry=0.5 → clamped to 0.5
    assert stop >= 99.5


def test_get_stop_price_max_pct_guard_AC9():
    kp = KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)
    stop = kp.get_stop_price(entry=100.0, atr=10.0, regime=RegimeLabel.BEAR)
    # BEAR atr_mult=2.0, stop_dist=20 > max_stop_pct*entry=5.0 → clamped to 5.0 → stop=95.0
    assert stop >= 95.0
