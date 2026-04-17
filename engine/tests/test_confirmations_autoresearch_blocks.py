from __future__ import annotations

import pandas as pd

from building_blocks.context import Context
from building_blocks.confirmations.ls_ratio_recovery import ls_ratio_recovery
from building_blocks.confirmations.positive_funding_bias import positive_funding_bias
from building_blocks.confirmations.post_dump_compression import post_dump_compression
from building_blocks.confirmations.reclaim_after_dump import reclaim_after_dump


def _ctx(features: pd.DataFrame, klines: pd.DataFrame | None = None) -> Context:
    if klines is None:
        klines = pd.DataFrame(
            {
                "open": [1.0] * len(features),
                "high": [1.05] * len(features),
                "low": [0.95] * len(features),
                "close": [1.0] * len(features),
                "volume": [1000.0] * len(features),
                "taker_buy_base_volume": [500.0] * len(features),
            },
            index=features.index,
        )
    return Context(klines=klines, features=features, symbol="TESTUSDT")


def test_positive_funding_bias_detects_positive_average() -> None:
    index = pd.date_range("2026-04-01", periods=5, freq="h", tz="UTC")
    features = pd.DataFrame({"funding_rate": [-0.01, 0.02, 0.03, 0.04, 0.05]}, index=index)
    result = positive_funding_bias(_ctx(features), lookback=4)
    assert bool(result.iloc[-1]) is True


def test_ls_ratio_recovery_detects_rebound() -> None:
    index = pd.date_range("2026-04-01", periods=8, freq="h", tz="UTC")
    features = pd.DataFrame({"long_short_ratio": [1.0, 0.97, 0.94, 0.92, 0.93, 0.95, 0.97, 1.0]}, index=index)
    result = ls_ratio_recovery(_ctx(features), lookback=6, recovery_threshold=0.03)
    assert bool(result.iloc[-1]) is True


def test_post_dump_compression_detects_range_contraction() -> None:
    index = pd.date_range("2026-04-01", periods=8, freq="h", tz="UTC")
    features = pd.DataFrame({"funding_rate": [0.0] * 8}, index=index)
    klines = pd.DataFrame(
        {
            "open": [1.0] * 8,
            "high": [1.3, 1.28, 1.25, 1.22, 1.08, 1.07, 1.06, 1.05],
            "low": [0.7, 0.72, 0.75, 0.78, 0.94, 0.95, 0.96, 0.97],
            "close": [1.0] * 8,
            "volume": [1000.0] * 8,
            "taker_buy_base_volume": [500.0] * 8,
        },
        index=index,
    )
    result = post_dump_compression(_ctx(features, klines), recent_bars=2, baseline_bars=4, compression_ratio=0.75)
    assert bool(result.iloc[-1]) is True


def test_reclaim_after_dump_detects_close_recovery() -> None:
    index = pd.date_range("2026-04-01", periods=6, freq="h", tz="UTC")
    features = pd.DataFrame({"funding_rate": [0.0] * 6}, index=index)
    klines = pd.DataFrame(
        {
            "open": [10.0, 9.8, 9.4, 9.2, 9.5, 9.8],
            "high": [10.1, 9.9, 9.5, 9.4, 9.8, 10.0],
            "low": [9.7, 9.2, 8.8, 8.7, 9.1, 9.3],
            "close": [9.8, 9.3, 8.9, 9.0, 9.6, 9.9],
            "volume": [1000.0] * 6,
            "taker_buy_base_volume": [500.0] * 6,
        },
        index=index,
    )
    result = reclaim_after_dump(_ctx(features, klines), lookback=5, reclaim_threshold=0.6)
    assert bool(result.iloc[-1]) is True
