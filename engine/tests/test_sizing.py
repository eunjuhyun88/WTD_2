"""W-0311 — sizing.py unit tests."""
from __future__ import annotations

import pytest

from research.validation.regime import RegimeLabel, VolLabel
from research.validation.sizing import (
    dynamic_atr_multiplier,
    regime_multiplier,
    required_edge_pct,
    REGIME_MULT_CLAMP,
)


def test_regime_multiplier_bull_baseline():
    assert regime_multiplier(RegimeLabel.BULL) == pytest.approx(1.2)


def test_regime_multiplier_bear_baseline():
    assert regime_multiplier(RegimeLabel.BEAR) == pytest.approx(0.6)


def test_regime_multiplier_range_baseline():
    assert regime_multiplier(RegimeLabel.RANGE) == pytest.approx(0.8)


def test_regime_multiplier_high_vol_discount():
    # BULL=1.2, HIGH_VOL=0.85 → 1.2 * 0.85 = 1.02
    result = regime_multiplier(RegimeLabel.BULL, VolLabel.HIGH_VOL)
    assert result == pytest.approx(1.02)


def test_regime_multiplier_low_vol_boost():
    # BEAR=0.6, LOW_VOL=1.05 → 0.6 * 1.05 = 0.63
    result = regime_multiplier(RegimeLabel.BEAR, VolLabel.LOW_VOL)
    assert result == pytest.approx(0.63)


def test_regime_multiplier_clamp_upper_bound():
    # Any combination must not exceed 1.4
    for regime in RegimeLabel:
        for vol in list(VolLabel) + [None]:
            result = regime_multiplier(regime, vol)
            assert result <= REGIME_MULT_CLAMP[1]


def test_dynamic_atr_multiplier_per_regime():
    assert dynamic_atr_multiplier(RegimeLabel.BULL) == pytest.approx(1.2)
    assert dynamic_atr_multiplier(RegimeLabel.RANGE) == pytest.approx(1.5)
    assert dynamic_atr_multiplier(RegimeLabel.BEAR) == pytest.approx(2.0)


def test_required_edge_pct_wilson_lower_bound():
    # rr=3, n=10, confidence=0.80
    # breakeven=0.25, z=1.282, margin=1.282*sqrt(0.25*0.75/10)≈0.1755 → result≈0.4255
    result = required_edge_pct(rr_ratio=3, n_samples=10, confidence=0.80)
    assert abs(result - 0.426) < 0.01
