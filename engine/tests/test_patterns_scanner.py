from __future__ import annotations

from datetime import datetime, timezone

from patterns.entry_scorer import PatternEntryScore
from patterns.state_store import PatternStateStore
from patterns.types import PhaseTransition
import patterns.scanner as pattern_scanner


def test_on_entry_signal_persists_shadow_ml_metadata(monkeypatch) -> None:
    saved = []

    class FakeStore:
        def save(self, outcome):
            saved.append(outcome)
            return None

    monkeypatch.setattr(pattern_scanner, "LEDGER_STORE", FakeStore())
    monkeypatch.setattr(pattern_scanner, "_get_entry_price", lambda symbol: 123.45)
    monkeypatch.setattr(pattern_scanner, "_detect_btc_trend", lambda: "bullish")
    monkeypatch.setattr(
        pattern_scanner,
        "score_entry_feature_snapshot",
        lambda snapshot: PatternEntryScore(
            state="scored",
            p_win=0.73,
            model_version="20260414_010203",
            threshold=0.55,
            threshold_passed=True,
            error=None,
        ),
    )

    transition = PhaseTransition(
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        from_phase="REAL_DUMP",
        to_phase="ACCUMULATION",
        timestamp=datetime(2026, 4, 14, 1, 0, tzinfo=timezone.utc),
        confidence=0.75,
        feature_snapshot={"ema20_slope": 0.1, "oi_change_1h": 0.2},
    )

    pattern_scanner._on_entry_signal(transition)

    assert len(saved) == 1
    outcome = saved[0]
    assert outcome.symbol == "PTBUSDT"
    assert outcome.entry_price == 123.45
    assert outcome.btc_trend_at_entry == "bullish"
    assert outcome.entry_block_coverage == 0.75
    assert outcome.entry_transition_id == transition.transition_id
    assert outcome.entry_p_win == 0.73
    assert outcome.entry_ml_state == "scored"
    assert outcome.entry_model_version == "20260414_010203"
    assert outcome.entry_threshold == 0.55
    assert outcome.entry_threshold_passed is True
    assert outcome.feature_snapshot == {"ema20_slope": 0.1, "oi_change_1h": 0.2}


def test_entry_candidate_records_include_transition_evidence(tmp_path, monkeypatch) -> None:
    store = PatternStateStore(tmp_path / "runtime.sqlite")
    monkeypatch.setattr(pattern_scanner, "STATE_STORE", store)
    pattern_scanner._MACHINES.clear()

    transitioned_at = datetime(2026, 4, 15, 2, 0, tzinfo=timezone.utc)
    transition = PhaseTransition(
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        pattern_version=1,
        timeframe="1h",
        from_phase="REAL_DUMP",
        to_phase="ACCUMULATION",
        from_phase_idx=2,
        to_phase_idx=3,
        timestamp=transitioned_at,
        scan_id="scan-123",
        is_entry_signal=True,
        confidence=0.8,
        feature_snapshot={"oi_change_1h": 0.18},
        blocks_triggered=["higher_lows_sequence", "funding_flip"],
        block_scores={"funding_flip": {"passed": True, "score": 1.0}},
    )
    store.append_transition(transition)

    records_by_pattern = pattern_scanner.get_entry_candidate_records()
    records = records_by_pattern["tradoor-oi-reversal-v1"]

    assert len(records) == 1
    record = records[0]
    assert record["symbol"] == "PTBUSDT"
    assert record["phase"] == "ACCUMULATION"
    assert record["transition_id"] == transition.transition_id
    assert record["candidate_transition_id"] == transition.transition_id
    assert record["scan_id"] == "scan-123"
    assert record["confidence"] == 0.8
    assert record["feature_snapshot"] == {"oi_change_1h": 0.18}
    assert record["block_scores"]["funding_flip"]["passed"] is True
