from __future__ import annotations

import numpy as np
import pandas as pd

from scanner.feature_calc import compute_snapshot
from scoring.feature_analysis import approximate_feature_contribution, top_feature_stability


class _FakeModel:
    feature_importances_ = np.ones(200, dtype=np.float64)


def _make_snapshot():
    rng = np.random.default_rng(42)
    n = 600
    returns = rng.normal(loc=0.0001, scale=0.005, size=n)
    close = 100.0 * np.exp(np.cumsum(returns))
    high = close * (1.0 + np.abs(rng.normal(0.0, 0.002, size=n)))
    low = close * (1.0 - np.abs(rng.normal(0.0, 0.002, size=n)))
    open_ = np.concatenate([[close[0]], close[:-1]])
    volume = rng.uniform(1000.0, 5000.0, size=n)
    taker_buy = volume * rng.uniform(0.3, 0.7, size=n)
    idx = pd.date_range("2025-01-01", periods=n, freq="1h", tz="UTC")
    klines = pd.DataFrame(
        {
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
            "taker_buy_base_volume": taker_buy,
        },
        index=idx,
    )
    return compute_snapshot(klines, "BTCUSDT")


def test_approximate_feature_contribution_fallback():
    snap = _make_snapshot()
    rows = approximate_feature_contribution(_FakeModel(), snap)
    assert rows
    assert rows[0].name


def test_top_feature_stability():
    hist = [
        {"a": 3.0, "b": 2.0, "c": 1.0},
        {"a": 2.9, "b": 2.1, "d": 1.0},
        {"a": 3.1, "b": 1.9, "c": 0.8},
    ]
    result = top_feature_stability(hist, top_k=2)
    assert result["pairs"] == 3
    assert 0.0 <= result["mean_jaccard"] <= 1.0

