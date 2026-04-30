"""Tests for W-0338: macro_regime_extreme block + liquidation registry wiring.

Verifies:
1. macro_regime_extreme block returns True/False correctly for each mode
2. Graceful False when required column is absent
3. Registry has coinalyze_liquidations DataSource
4. block_evaluator has 4 macro_regime entries registered
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_context(features: pd.DataFrame, symbol: str = "BTCUSDT"):
    from building_blocks.context import Context
    idx = features.index
    klines = pd.DataFrame({
        "open": np.full(len(idx), 100.0),
        "high": np.full(len(idx), 101.0),
        "low": np.full(len(idx), 99.0),
        "close": np.full(len(idx), 100.5),
        "volume": np.full(len(idx), 1000.0),
        "taker_buy_base_volume": np.full(len(idx), 500.0),
    }, index=idx)
    return Context(klines=klines, features=features, symbol=symbol)


def _ctx_with(n: int = 5, **col_vals) -> "Context":
    idx = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    features = pd.DataFrame({k: [v] * n for k, v in col_vals.items()}, index=idx)
    return _make_context(features)


# ── macro_regime_extreme unit tests ───────────────────────────────────────────

class TestMacroRegimeExtremeBlock:
    def test_fear_mode_true_when_below_threshold(self):
        from building_blocks.confirmations.macro_regime_extreme import macro_regime_extreme
        ctx = _ctx_with(fear_greed=15.0)
        assert macro_regime_extreme(ctx, mode="fear").all()

    def test_fear_mode_false_when_above_threshold(self):
        from building_blocks.confirmations.macro_regime_extreme import macro_regime_extreme
        ctx = _ctx_with(fear_greed=50.0)
        assert not macro_regime_extreme(ctx, mode="fear").any()

    def test_greed_mode_true_when_above_threshold(self):
        from building_blocks.confirmations.macro_regime_extreme import macro_regime_extreme
        ctx = _ctx_with(fear_greed=85.0)
        assert macro_regime_extreme(ctx, mode="greed").all()

    def test_greed_mode_false_when_below_threshold(self):
        from building_blocks.confirmations.macro_regime_extreme import macro_regime_extreme
        ctx = _ctx_with(fear_greed=50.0)
        assert not macro_regime_extreme(ctx, mode="greed").any()

    def test_vix_spike_true_when_above_threshold(self):
        from building_blocks.confirmations.macro_regime_extreme import macro_regime_extreme
        ctx = _ctx_with(vix_close=45.0)
        assert macro_regime_extreme(ctx, mode="vix_spike").all()

    def test_vix_spike_false_when_below_threshold(self):
        from building_blocks.confirmations.macro_regime_extreme import macro_regime_extreme
        ctx = _ctx_with(vix_close=20.0)
        assert not macro_regime_extreme(ctx, mode="vix_spike").any()

    def test_btc_dom_high_true_when_above_threshold(self):
        from building_blocks.confirmations.macro_regime_extreme import macro_regime_extreme
        ctx = _ctx_with(btc_dominance=65.0)
        assert macro_regime_extreme(ctx, mode="btc_dom_high").all()

    def test_btc_dom_high_false_when_below_threshold(self):
        from building_blocks.confirmations.macro_regime_extreme import macro_regime_extreme
        ctx = _ctx_with(btc_dominance=50.0)
        assert not macro_regime_extreme(ctx, mode="btc_dom_high").any()

    def test_custom_threshold_overrides_default(self):
        from building_blocks.confirmations.macro_regime_extreme import macro_regime_extreme
        # Default fear threshold is 20, custom is 30 — value 25 should trigger custom
        ctx = _ctx_with(fear_greed=25.0)
        assert not macro_regime_extreme(ctx, mode="fear").any()          # < 20 default: False
        assert macro_regime_extreme(ctx, mode="fear", threshold=30.0).all()  # < 30 custom: True

    @pytest.mark.parametrize("mode", ["fear", "greed", "vix_spike", "btc_dom_high"])
    def test_graceful_false_when_column_absent(self, mode):
        from building_blocks.confirmations.macro_regime_extreme import macro_regime_extreme
        ctx = _ctx_with(price=100.0)  # none of the macro cols present
        result = macro_regime_extreme(ctx, mode=mode)
        assert not result.any()
        assert len(result) == 5


# ── registry liquidation DataSource ──────────────────────────────────────────

class TestLiquidationRegistry:
    def test_coinalyze_liquidations_in_onchain_sources(self):
        from data_cache.registry import ONCHAIN_SOURCES
        names = [src.name for src in ONCHAIN_SOURCES]
        assert "coinalyze_liquidations" in names

    def test_liquidation_columns_listed(self):
        from data_cache.registry import ONCHAIN_SOURCES
        src = next(s for s in ONCHAIN_SOURCES if s.name == "coinalyze_liquidations")
        assert "long_liq_usd" in src.columns
        assert "short_liq_usd" in src.columns

    def test_liquidation_defaults_are_zero(self):
        from data_cache.registry import ONCHAIN_SOURCES
        src = next(s for s in ONCHAIN_SOURCES if s.name == "coinalyze_liquidations")
        assert src.defaults["long_liq_usd"] == 0.0
        assert src.defaults["short_liq_usd"] == 0.0

    def test_registry_adapter_returns_none_without_api_key(self, monkeypatch):
        """Without Coinalyze API key, adapter should return None (graceful skip)."""
        monkeypatch.delenv("COINALYZE_API_KEY", raising=False)
        monkeypatch.delenv("COINALYZE_KEY", raising=False)
        from data_cache.registry import _fetch_liquidations_registry
        result = _fetch_liquidations_registry("BTCUSDT", 7)
        assert result is None


# ── block_evaluator registration ──────────────────────────────────────────────

class TestMacroBlocksInEvaluator:
    def test_four_macro_blocks_registered(self):
        from scoring import block_evaluator
        block_ids = [b[0] for b in block_evaluator._BLOCKS]
        assert "macro_fear_extreme" in block_ids
        assert "macro_greed_extreme" in block_ids
        assert "macro_vix_spike" in block_ids
        assert "macro_btc_dom_high" in block_ids

    def test_macro_fear_block_callable_returns_series(self):
        """The lambda registered for macro_fear_extreme must be callable and return Series."""
        from scoring import block_evaluator
        entry = next(b for b in block_evaluator._BLOCKS if b[0] == "macro_fear_extreme")
        ctx = _ctx_with(fear_greed=10.0)
        result = entry[1](ctx)
        assert isinstance(result, pd.Series)
        assert result.all()
