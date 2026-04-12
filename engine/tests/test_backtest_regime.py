"""Tests for backtest.regime (D12 stub + D15 preview)."""
from __future__ import annotations

import pandas as pd
import pytest

from backtest.regime import (
    label_regime_by_btc_30d,
    label_regime_stub,
)


def test_stub_returns_unknown_for_every_timestamp():
    ts = [pd.Timestamp(f"2024-01-0{d}", tz="UTC") for d in range(1, 5)]
    labels = label_regime_stub(ts)
    assert len(labels) == 4
    assert all(l.regime == "unknown" for l in labels)
    assert [l.time for l in labels] == ts


def _btc_klines(rows: list[float]) -> pd.DataFrame:
    idx = pd.date_range("2024-01-01", periods=len(rows), freq="h", tz="UTC")
    return pd.DataFrame(
        {"close": rows},
        index=idx,
    )


def test_btc_30d_labels_bull_bear_chop():
    n = 720 + 5  # one full window + a few ticks past it
    # Bull at index 720: close[720]/close[0] = 1.2 → +20%
    bull_closes = [100.0 + i * (20.0 / 720) for i in range(n)]
    bull_klines = _btc_klines(bull_closes)
    ts = [bull_klines.index[720]]
    labels = label_regime_by_btc_30d(ts, bull_klines)
    assert labels[0].regime == "bull"

    bear_closes = [100.0 - i * (20.0 / 720) for i in range(n)]
    bear_klines = _btc_klines(bear_closes)
    labels = label_regime_by_btc_30d(ts, bear_klines)
    assert labels[0].regime == "bear"

    chop_closes = [100.0 + (i % 3 - 1) * 0.5 for i in range(n)]
    chop_klines = _btc_klines(chop_closes)
    labels = label_regime_by_btc_30d(ts, chop_klines)
    assert labels[0].regime == "chop"


def test_btc_30d_labels_unknown_when_window_too_short():
    # Only 100 bars; can't fit a 720-bar window.
    klines = _btc_klines([100.0 + i * 0.1 for i in range(100)])
    labels = label_regime_by_btc_30d([klines.index[50]], klines)
    assert labels[0].regime == "unknown"


def test_btc_30d_unknown_for_timestamps_not_in_klines():
    klines = _btc_klines([100.0] * 1000)
    ts = [pd.Timestamp("2030-06-01", tz="UTC")]
    labels = label_regime_by_btc_30d(ts, klines)
    assert labels[0].regime == "unknown"
