"""Tests for W-0290 Phase 1 cost model module."""
from __future__ import annotations

import pytest

from engine.research.validation.costs import (
    BINANCE_PERP_TAKER_15BPS_V1,
    BINANCE_SPOT_TAKER_20BPS_V1,
    CostModel,
    COST_MODEL_REGISTRY,
    get_cost_model,
)


def test_total_cost_no_funding() -> None:
    """1h horizon: funding excluded (< 24h threshold)."""
    model = BINANCE_PERP_TAKER_15BPS_V1
    cost = model.total_cost_bps(horizon_hours=1)
    assert cost == pytest.approx(15.0)  # 10 + 5


def test_total_cost_with_funding() -> None:
    """24h horizon: funding included (24h >= 24h threshold)."""
    model = BINANCE_PERP_TAKER_15BPS_V1
    cost = model.total_cost_bps(horizon_hours=24)
    # base=15, funding = 1.0 * (24/8) = 3.0 → total = 18.0
    assert cost == pytest.approx(18.0)


def test_total_cost_funding_48h() -> None:
    """48h horizon: funding = 1.0 * 6 periods = 6.0 bps."""
    model = BINANCE_PERP_TAKER_15BPS_V1
    cost = model.total_cost_bps(horizon_hours=48)
    assert cost == pytest.approx(21.0)


def test_net_edge_threshold() -> None:
    """net_edge_threshold = 2 × (taker_roundtrip + slippage)."""
    model = BINANCE_PERP_TAKER_15BPS_V1
    threshold = model.net_edge_threshold_bps()
    assert threshold == pytest.approx(30.0)  # 2 × (10 + 5)


def test_registry_lookup() -> None:
    """get_cost_model returns correct model by ID."""
    model = get_cost_model("binance_perp_taker_15bps_v1")
    assert model.cost_model_id == "binance_perp_taker_15bps_v1"
    assert model.taker_roundtrip_bps == 10.0


def test_unknown_model_raises() -> None:
    """Unknown cost_model_id raises KeyError."""
    with pytest.raises(KeyError, match="Unknown cost_model_id"):
        get_cost_model("nonexistent_model_v999")


def test_registry_contains_all_presets() -> None:
    """All predefined models are in the registry."""
    assert "binance_perp_taker_15bps_v1" in COST_MODEL_REGISTRY
    assert "binance_perp_alt_45bps_v1" in COST_MODEL_REGISTRY
    assert "binance_spot_taker_20bps_v1" in COST_MODEL_REGISTRY


def test_spot_model_excludes_funding() -> None:
    """Spot model never adds funding regardless of horizon."""
    model = BINANCE_SPOT_TAKER_20BPS_V1
    cost_1h = model.total_cost_bps(horizon_hours=1)
    cost_72h = model.total_cost_bps(horizon_hours=72)
    # funding_policy="exclude" → same base cost both horizons
    assert cost_1h == cost_72h
    assert cost_1h == pytest.approx(20.0)  # 10 + 10
