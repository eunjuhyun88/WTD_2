from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from patterns.library import TRADOOR_OI_REVERSAL
from patterns.replay import replay_pattern_frames
from patterns.state_machine import PatternStateMachine


def _index() -> pd.DatetimeIndex:
    return pd.date_range(datetime(2026, 4, 1, tzinfo=timezone.utc), periods=10, freq="h")


def _frames() -> tuple[pd.DataFrame, pd.DataFrame]:
    idx = _index()
    klines = pd.DataFrame(
        {
            "open": [10.0] * len(idx),
            "high": [10.2] * len(idx),
            "low": [9.8] * len(idx),
            "close": [10.0] * len(idx),
            "volume": [1000.0] * len(idx),
            "taker_buy_base_volume": [500.0] * len(idx),
        },
        index=idx,
    )
    features = pd.DataFrame(
        {
            "funding_rate": [0.0] * len(idx),
            "long_short_ratio": [1.0] * len(idx),
        },
        index=idx,
    )
    return klines, features


def _mask(index: pd.DatetimeIndex, active_at: set[int]) -> pd.Series:
    return pd.Series([i in active_at for i in range(len(index))], index=index, dtype=bool)


def test_replay_restores_real_dump_state(monkeypatch) -> None:
    klines, features = _frames()
    index = features.index
    monkeypatch.setattr(
        "patterns.replay.evaluate_block_masks",
        lambda *_args, **_kwargs: {
            "recent_decline": _mask(index, {0}),
            "funding_extreme": _mask(index, {0}),
            "sideways_compression": _mask(index, {2}),
            "oi_spike_with_dump": _mask(index, {7}),
            "volume_spike": _mask(index, {7}),
        },
    )

    machine = PatternStateMachine(TRADOOR_OI_REVERSAL)
    result = replay_pattern_frames(
        machine,
        "PTBUSDT",
        features_df=features,
        klines_df=klines,
        lookback_bars=10,
    )

    assert result.current_phase == "REAL_DUMP"
    assert [phase for phase, _ in result.phase_history] == ["FAKE_DUMP", "ARCH_ZONE", "REAL_DUMP"]
    assert result.last_anchor_transition_id is not None


def test_replay_restores_entry_candidate(monkeypatch) -> None:
    klines, features = _frames()
    index = features.index
    monkeypatch.setattr(
        "patterns.replay.evaluate_block_masks",
        lambda *_args, **_kwargs: {
            "recent_decline": _mask(index, {0}),
            "funding_extreme": _mask(index, {0}),
            "sideways_compression": _mask(index, {2}),
            "oi_spike_with_dump": _mask(index, {7}),
            "volume_spike": _mask(index, {7, 9}),
            "higher_lows_sequence": _mask(index, {9}),
            "oi_hold_after_spike": _mask(index, {9}),
            "positive_funding_bias": _mask(index, {9}),
        },
    )

    machine = PatternStateMachine(TRADOOR_OI_REVERSAL)
    result = replay_pattern_frames(
        machine,
        "TRADOORUSDT",
        features_df=features,
        klines_df=klines,
        lookback_bars=10,
    )

    assert result.current_phase == "ACCUMULATION"
    assert result.candidate_status == "entry"
    assert result.phase_scores_by_bar[-1]["phase_scores"]["ACCUMULATION"] >= 0.85


def test_replay_restores_breakout_candidate(monkeypatch) -> None:
    index = pd.date_range(datetime(2026, 4, 1, tzinfo=timezone.utc), periods=17, freq="h")
    klines = pd.DataFrame(
        {
            "open": [10.0] * len(index),
            "high": [10.2] * len(index),
            "low": [9.8] * len(index),
            "close": [10.0] * len(index),
            "volume": [1000.0] * len(index),
            "taker_buy_base_volume": [500.0] * len(index),
        },
        index=index,
    )
    features = pd.DataFrame(
        {
            "funding_rate": [0.0] * len(index),
            "long_short_ratio": [1.0] * len(index),
        },
        index=index,
    )
    monkeypatch.setattr(
        "patterns.replay.evaluate_block_masks",
        lambda *_args, **_kwargs: {
            "recent_decline": _mask(index, {0}),
            "funding_extreme": _mask(index, {0}),
            "sideways_compression": _mask(index, {2}),
            "oi_spike_with_dump": _mask(index, {7}),
            "volume_spike": _mask(index, {7}),
            "higher_lows_sequence": _mask(index, {9}),
            "oi_hold_after_spike": _mask(index, {9}),
            "positive_funding_bias": _mask(index, {9}),
            "breakout_after_accumulation": _mask(index, {16}),
            "oi_expansion_confirm": _mask(index, {16}),
        },
    )

    machine = PatternStateMachine(TRADOOR_OI_REVERSAL)
    result = replay_pattern_frames(
        machine,
        "PTBUSDT",
        features_df=features,
        klines_df=klines,
        lookback_bars=len(index),
    )

    assert result.current_phase == "BREAKOUT"
    assert result.candidate_status == "tracking"
