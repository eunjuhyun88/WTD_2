from __future__ import annotations

import numpy as np
import pandas as pd

from features.materialization import compute_feature_window, materialize_window_bundle
from features.materialization_store import FeatureMaterializationStore
from scanner.jobs.feature_materialization import materialize_symbol_window


def _make_breakout_bars(n: int = 80) -> pd.DataFrame:
    idx = pd.date_range("2026-04-20", periods=n, freq="1h", tz="UTC")
    base = np.linspace(100.0, 103.5, n)
    close = pd.Series(base, index=idx)
    close.iloc[-1] = 106.0
    high = close * 1.01
    low = close * 0.99
    open_ = close.shift(1).fillna(close.iloc[0] * 0.995)
    volume = pd.Series(1000.0, index=idx)
    volume.iloc[-1] = 10000.0
    taker_buy = volume * 0.55
    taker_buy.iloc[-1] = 8500.0
    return pd.DataFrame(
        {
            "open": open_.to_numpy(),
            "high": high.to_numpy(),
            "low": low.to_numpy(),
            "close": close.to_numpy(),
            "volume": volume.to_numpy(),
            "taker_buy_base_volume": taker_buy.to_numpy(),
        },
        index=idx,
    )


def _make_breakout_perp(index: pd.Index) -> pd.DataFrame:
    open_interest = pd.Series(np.linspace(100.0, 127.0, len(index)), index=index)
    open_interest.iloc[-8:] = [120.0, 124.0, 126.0, 127.0, 124.0, 121.0, 121.0, 128.0]
    funding = pd.Series(-0.002, index=index)
    funding.iloc[-2] = -0.001
    funding.iloc[-1] = 0.0015
    long_short = pd.Series(np.linspace(0.9, 1.2, len(index)), index=index)
    return pd.DataFrame(
        {
            "open_interest": open_interest,
            "funding_rate": funding,
            "long_short_ratio": long_short,
        },
        index=index,
    )


def test_compute_feature_window_detects_breakout_phase() -> None:
    bars = _make_breakout_bars()
    perp = _make_breakout_perp(bars.index)

    features = compute_feature_window(
        bars,
        venue="binance",
        symbol="PTBUSDT",
        timeframe="1h",
        perp=perp,
        window_bars=64,
        pattern_family="tradoor_ptb_oi_reversal",
    )

    assert features["breakout_flag"] is True
    assert features["volume_spike_flag"] is True
    assert features["oi_reexpansion_flag"] is True
    assert features["funding_positive_flag"] is True
    assert features["higher_low_count"] >= 2
    assert features["phase_guess"] == "breakout_oi_reexpand"


def test_materialize_symbol_window_persists_feature_event_and_signature(tmp_path) -> None:
    bars = _make_breakout_bars()
    perp = _make_breakout_perp(bars.index)
    store = FeatureMaterializationStore(tmp_path / "feature_materialization.sqlite")

    result = materialize_symbol_window(
        symbol="PTBUSDT",
        timeframe="1h",
        venue="binance",
        pattern_family="tradoor_ptb_oi_reversal",
        store=store,
        bars=bars,
        perp=perp,
    )

    feature_window = result["feature_window"]
    persisted = store.get_feature_window(
        venue="binance",
        symbol="PTBUSDT",
        timeframe="1h",
        window_start_ts=feature_window["window_start_ts"],
        window_end_ts=feature_window["window_end_ts"],
    )
    assert persisted is not None
    assert persisted["phase_guess"] == "breakout_oi_reexpand"

    events = store.list_pattern_events(
        venue="binance",
        symbol="PTBUSDT",
        timeframe="1h",
        pattern_family="tradoor_ptb_oi_reversal",
    )
    assert len(events) == 1
    assert events[0]["phase"] == "breakout_oi_reexpand"

    signature = store.get_search_corpus_signature(
        venue="binance",
        symbol="PTBUSDT",
        timeframe="1h",
        window_start_ts=feature_window["window_start_ts"],
        window_end_ts=feature_window["window_end_ts"],
        signature_version="v1",
    )
    assert signature is not None
    assert signature["signature_json"]["phase_path"] == ["breakout_oi_reexpand"]


def test_materialize_window_bundle_emits_compact_signature() -> None:
    bars = _make_breakout_bars()
    perp = _make_breakout_perp(bars.index)

    bundle = materialize_window_bundle(
        bars,
        venue="binance",
        symbol="TRADOORUSDT",
        timeframe="1h",
        perp=perp,
        pattern_family="tradoor_ptb_oi_reversal",
    )

    assert bundle.pattern_event is not None
    assert bundle.search_signature["pattern_family"] == "tradoor_ptb_oi_reversal"
    assert "oi_zscore" in bundle.search_signature["signature_json"]
