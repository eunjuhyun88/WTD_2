from __future__ import annotations

from capture.store import CaptureStore
from capture.types import CaptureRecord


def test_capture_store_roundtrips_record(tmp_path) -> None:
    store = CaptureStore(tmp_path / "capture.sqlite")
    capture = CaptureRecord(
        user_id="user-1",
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        pattern_version=1,
        phase="ACCUMULATION",
        timeframe="1h",
        captured_at_ms=1770000000000,
        candidate_transition_id="transition-1",
        scan_id="scan-1",
        user_note="clean higher lows",
        chart_context={"close": 1.23},
        feature_snapshot={"oi_change_1h": 0.18},
        block_scores={"funding_flip": {"passed": True, "score": 1.0}},
    )

    store.save(capture)
    loaded = store.load(capture.capture_id)

    assert loaded is not None
    assert loaded.capture_id == capture.capture_id
    assert loaded.user_id == "user-1"
    assert loaded.candidate_transition_id == "transition-1"
    assert loaded.chart_context == {"close": 1.23}
    assert loaded.feature_snapshot == {"oi_change_1h": 0.18}
    assert loaded.block_scores["funding_flip"]["passed"] is True


def test_capture_store_filters_by_user_and_pattern(tmp_path) -> None:
    store = CaptureStore(tmp_path / "capture.sqlite")
    store.save(
        CaptureRecord(
            user_id="user-1",
            symbol="PTBUSDT",
            pattern_slug="tradoor-oi-reversal-v1",
            phase="ACCUMULATION",
            captured_at_ms=2,
        )
    )
    store.save(
        CaptureRecord(
            user_id="user-2",
            symbol="BTCUSDT",
            pattern_slug="other",
            phase="ENTRY",
            captured_at_ms=1,
        )
    )

    captures = store.list(user_id="user-1", pattern_slug="tradoor-oi-reversal-v1")

    assert len(captures) == 1
    assert captures[0].symbol == "PTBUSDT"
