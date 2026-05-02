"""Tests for the features package — registry, primitives, and compute_snapshot equivalence."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from features import compute_snapshot, FEATURE_COLUMNS, MIN_HISTORY_BARS
from features.registry import get_all, get_by_domain, feature_fingerprint, FeatureGroup
from features import primitives as P


def _make_klines(n: int, drift: float = 0.0, seed: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    returns = rng.normal(loc=drift, scale=0.005, size=n)
    close = 100.0 * np.exp(np.cumsum(returns))
    high = close * (1.0 + np.abs(rng.normal(0.0, 0.002, size=n)))
    low = close * (1.0 - np.abs(rng.normal(0.0, 0.002, size=n)))
    open_ = np.concatenate([[close[0]], close[:-1]])
    volume = rng.uniform(1000.0, 5000.0, size=n)
    taker_buy = volume * rng.uniform(0.3, 0.7, size=n)
    idx = pd.date_range("2025-01-01", periods=n, freq="1h", tz="UTC")
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close,
         "volume": volume, "taker_buy_base_volume": taker_buy},
        index=idx,
    )


class TestRegistry:
    def test_all_groups_registered(self):
        groups = get_all()
        assert len(groups) >= 25

    def test_get_by_domain(self):
        momentum = get_by_domain("momentum")
        assert len(momentum) >= 5
        assert all(g.domain == "momentum" for g in momentum)

    def test_fingerprint_is_stable(self):
        fp1 = feature_fingerprint()
        fp2 = feature_fingerprint()
        assert fp1 == fp2
        assert len(fp1) == 16

    def test_group_has_output_columns(self):
        for name, group in get_all().items():
            if name not in ("macro", "onchain"):
                assert len(group.output_columns) > 0, f"{name} has no output columns"


class TestPrimitives:
    def test_ema_basic(self):
        s = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])
        result = P.ema(s, 3)
        assert len(result) == 5
        assert result.iloc[-1] > result.iloc[0]

    def test_rsi_range(self):
        s = pd.Series(np.random.default_rng(42).normal(100, 1, 100).cumsum())
        result = P.rsi(s, 14)
        assert (result >= 0).all() and (result <= 100).all()

    def test_bollinger_bands_order(self):
        s = pd.Series(np.random.default_rng(42).normal(100, 1, 50).cumsum())
        lower, mid, upper = P.bollinger(s)
        valid = lower.dropna()
        assert (valid <= mid.dropna()).all()


class TestComputeSnapshot:
    def test_equivalence_with_original(self):
        """New features.compute_snapshot must produce identical output to scanner.feature_calc."""
        from scanner.feature_calc import compute_snapshot as original_cs

        klines = _make_klines(600)
        new = compute_snapshot(klines, "BTCUSDT")
        old = original_cs(klines, "BTCUSDT")

        for field in type(new).model_fields:
            new_val = getattr(new, field)
            old_val = getattr(old, field)
            if isinstance(new_val, float):
                assert abs(new_val - old_val) < 1e-10, f"Mismatch on {field}: {new_val} vs {old_val}"
            else:
                assert new_val == old_val, f"Mismatch on {field}: {new_val} vs {old_val}"

    def test_feature_columns_complete(self):
        assert len(FEATURE_COLUMNS) >= 89
        assert "rsi14" in FEATURE_COLUMNS
        assert "regime" in FEATURE_COLUMNS

    def test_min_history_bars(self):
        assert MIN_HISTORY_BARS == 500
