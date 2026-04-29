from __future__ import annotations

import math
from typing import Optional

from research.validation.regime import RegimeLabel, VolLabel

REGIME_MULT: dict[RegimeLabel, float] = {
    RegimeLabel.BULL:  1.2,
    RegimeLabel.BEAR:  0.6,
    RegimeLabel.RANGE: 0.8,
}

VOL_MULT: dict[VolLabel, float] = {
    VolLabel.HIGH_VOL:   0.85,
    VolLabel.NORMAL_VOL: 1.0,
    VolLabel.LOW_VOL:    1.05,
}

ATR_MULT: dict[RegimeLabel, float] = {
    RegimeLabel.BULL:  1.2,
    RegimeLabel.BEAR:  2.0,
    RegimeLabel.RANGE: 1.5,
}

VOL_ATR_MULT: dict[VolLabel, float] = {
    VolLabel.HIGH_VOL:   1.15,
    VolLabel.NORMAL_VOL: 1.0,
    VolLabel.LOW_VOL:    0.95,
}

REGIME_MULT_CLAMP: tuple[float, float] = (0.4, 1.4)


def regime_multiplier(
    regime: RegimeLabel,
    vol_label: Optional[VolLabel] = None,
) -> float:
    base = REGIME_MULT[regime]
    vol = VOL_MULT[vol_label] if vol_label else 1.0
    raw = base * vol
    return max(REGIME_MULT_CLAMP[0], min(REGIME_MULT_CLAMP[1], raw))


def dynamic_atr_multiplier(
    regime: RegimeLabel,
    vol_label: Optional[VolLabel] = None,
) -> float:
    base = ATR_MULT[regime]
    vol = VOL_ATR_MULT[vol_label] if vol_label else 1.0
    return base * vol


def apply_portfolio_penalty(
    base_position_usdt: float,
    penalty: float,
) -> float:
    if not (0.0 <= penalty <= 1.0):
        raise ValueError(f"penalty {penalty} not in [0,1]")
    return base_position_usdt * penalty


def required_edge_pct(
    rr_ratio: float,
    n_samples: int,
    confidence: float = 0.80,
) -> float:
    """Min hit_rate so Wilson lower bound > breakeven."""
    if n_samples < 1 or rr_ratio <= 0:
        return 1.0
    z_map = {0.80: 1.282, 0.90: 1.645, 0.95: 1.96}
    z = z_map.get(round(confidence, 2), 1.282)
    breakeven = 1.0 / (1.0 + rr_ratio)
    margin = z * math.sqrt(breakeven * (1.0 - breakeven) / n_samples)
    return min(1.0, breakeven + margin)
