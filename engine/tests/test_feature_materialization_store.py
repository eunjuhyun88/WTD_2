from __future__ import annotations

from features.materialization_store import FeatureMaterializationStore


def test_feature_materialization_store_roundtrips_records(tmp_path) -> None:
    store = FeatureMaterializationStore(tmp_path / "feature_materialization.sqlite")

    store.upsert_market_bars(
        [
            {
                "venue": "binance",
                "symbol": "PTBUSDT",
                "timeframe": "1h",
                "ts": "2026-04-24T00:00:00+00:00",
                "open": 1.0,
                "high": 1.2,
                "low": 0.9,
                "close": 1.1,
                "volume": 1000.0,
                "quote_volume": 1100.0,
                "trade_count": 42,
                "vwap": 1.05,
            }
        ]
    )
    store.upsert_feature_windows(
        [
            {
                "venue": "binance",
                "symbol": "PTBUSDT",
                "timeframe": "1h",
                "window_start_ts": "2026-04-23T00:00:00+00:00",
                "window_end_ts": "2026-04-24T00:00:00+00:00",
                "higher_low_count": 3,
                "oi_hold_flag": True,
                "volume_dryup_flag": False,
                "breakout_flag": True,
                "breakout_strength": 0.02,
                "phase_guess": "breakout_oi_reexpand",
                "pattern_family": "tradoor_ptb_oi_reversal",
            }
        ]
    )
    store.upsert_pattern_events(
        [
            {
                "venue": "binance",
                "symbol": "PTBUSDT",
                "timeframe": "1h",
                "ts": "2026-04-24T00:00:00+00:00",
                "pattern_family": "tradoor_ptb_oi_reversal",
                "phase": "breakout_oi_reexpand",
                "score": 1.0,
                "evidence_json": {"reason": "phase confirmed"},
                "feature_ref_json": {"window_end_ts": "2026-04-24T00:00:00+00:00"},
            }
        ]
    )
    store.upsert_search_corpus_signatures(
        [
            {
                "venue": "binance",
                "symbol": "PTBUSDT",
                "timeframe": "1h",
                "window_start_ts": "2026-04-23T00:00:00+00:00",
                "window_end_ts": "2026-04-24T00:00:00+00:00",
                "pattern_family": "tradoor_ptb_oi_reversal",
                "signature_version": "v1",
                "signature_json": {"phase_path": ["breakout_oi_reexpand"]},
                "score_vector_json": {"oi_component": 2.1},
            }
        ]
    )

    feature_window = store.get_feature_window(
        venue="binance",
        symbol="PTBUSDT",
        timeframe="1h",
        window_start_ts="2026-04-23T00:00:00+00:00",
        window_end_ts="2026-04-24T00:00:00+00:00",
    )
    assert feature_window is not None
    assert feature_window["higher_low_count"] == 3
    assert feature_window["breakout_flag"] == 1
    assert feature_window["pattern_family"] == "tradoor_ptb_oi_reversal"

    events = store.list_pattern_events(
        venue="binance",
        symbol="PTBUSDT",
        timeframe="1h",
        pattern_family="tradoor_ptb_oi_reversal",
    )
    assert len(events) == 1
    assert events[0]["phase"] == "breakout_oi_reexpand"
    assert events[0]["evidence_json"]["reason"] == "phase confirmed"

    signature = store.get_search_corpus_signature(
        venue="binance",
        symbol="PTBUSDT",
        timeframe="1h",
        window_start_ts="2026-04-23T00:00:00+00:00",
        window_end_ts="2026-04-24T00:00:00+00:00",
        signature_version="v1",
    )
    assert signature is not None
    assert signature["signature_json"]["phase_path"] == ["breakout_oi_reexpand"]
    assert signature["score_vector_json"]["oi_component"] == 2.1
