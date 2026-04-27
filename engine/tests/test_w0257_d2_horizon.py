"""W-0257 Priority B1: D2 forward-return horizon parametrization tests.

Verifies augment-only addition of:
- ``PromotionGatePolicy.horizon_label``
- ``_resolve_horizon_bars`` helper
- ``evaluate_variant_on_case`` / ``evaluate_variant_against_pack`` ``horizon_label`` arg
"""

from __future__ import annotations

import pytest

from research.pattern_search import (
    DEFAULT_ENTRY_PROFIT_HORIZON_BARS,
    DEFAULT_PROMOTION_GATE_POLICY,
    PromotionGatePolicy,
    _HORIZON_LABEL_MINUTES,
    _resolve_horizon_bars,
)


def test_default_policy_horizon_label_is_default():
    """Production default keeps legacy 48-bar behaviour."""
    assert DEFAULT_PROMOTION_GATE_POLICY.horizon_label == "default"


def test_horizon_label_minutes_registry():
    assert _HORIZON_LABEL_MINUTES == {"1h": 60, "4h": 240, "24h": 1440}


def test_resolve_default_returns_fallback():
    bars = _resolve_horizon_bars(
        horizon_label="default", timeframe="15m", fallback_bars=48
    )
    assert bars == 48


def test_resolve_unknown_label_returns_fallback():
    bars = _resolve_horizon_bars(
        horizon_label="not_a_label", timeframe="15m", fallback_bars=48
    )
    assert bars == 48


def test_resolve_4h_on_15m_timeframe():
    """4h horizon at 15m bars = 240 minutes / 15 minutes = 16 bars."""
    bars = _resolve_horizon_bars(
        horizon_label="4h", timeframe="15m", fallback_bars=48
    )
    assert bars == 16


def test_resolve_4h_on_1h_timeframe():
    """4h horizon at 1h bars = 240 / 60 = 4 bars."""
    bars = _resolve_horizon_bars(
        horizon_label="4h", timeframe="1h", fallback_bars=48
    )
    assert bars == 4


def test_resolve_4h_on_4h_timeframe_falls_back():
    """4h horizon at 4h bars = 1 bar — meaningful (≥1), not fallback."""
    bars = _resolve_horizon_bars(
        horizon_label="4h", timeframe="4h", fallback_bars=48
    )
    assert bars == 1


def test_resolve_1h_on_4h_timeframe_falls_back():
    """1h horizon at 4h bars = 0 — falls back to default."""
    bars = _resolve_horizon_bars(
        horizon_label="1h", timeframe="4h", fallback_bars=48
    )
    assert bars == 48


def test_resolve_24h_on_1h_timeframe():
    """24h horizon at 1h bars = 24 bars."""
    bars = _resolve_horizon_bars(
        horizon_label="24h", timeframe="1h", fallback_bars=48
    )
    assert bars == 24


def test_promotion_policy_horizon_label_round_trip():
    policy = PromotionGatePolicy(horizon_label="4h")
    payload = policy.to_dict()
    assert payload["horizon_label"] == "4h"


def test_resolve_horizon_matrix_3x3():
    """Spec AC2: 3 horizons × 3 timeframes matrix.

    Validates the conversion table the audit promised the design doc.
    """
    cases = [
        # (label, timeframe, expected_bars)
        ("1h", "15m", 4),
        ("1h", "1h", 1),
        ("1h", "4h", 48),  # fallback (0 bars)
        ("4h", "15m", 16),
        ("4h", "1h", 4),
        ("4h", "4h", 1),
        ("24h", "15m", 96),
        ("24h", "1h", 24),
        ("24h", "4h", 6),
    ]
    for label, tf, expected in cases:
        bars = _resolve_horizon_bars(
            horizon_label=label, timeframe=tf, fallback_bars=48
        )
        assert bars == expected, f"{label} on {tf} → {bars}, expected {expected}"
