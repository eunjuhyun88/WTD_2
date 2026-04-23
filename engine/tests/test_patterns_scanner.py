from __future__ import annotations

from datetime import datetime, timezone

from patterns.entry_scorer import PatternEntryScore
from patterns.state_store import PatternStateStore
from patterns.types import PhaseAttemptRecord, PhaseTransition
import patterns.scanner as pattern_scanner
from ledger.types import PatternOutcome


def test_on_entry_signal_persists_shadow_ml_metadata(monkeypatch) -> None:
    saved = []
    entry_records = []
    score_records = []

    class FakeStore:
        def save(self, outcome):
            saved.append(outcome)
            return None

    class FakeRecordStore:
        def append_entry_record(self, outcome):
            entry_records.append(outcome)
            return None

        def append_score_record(self, outcome):
            score_records.append(outcome)
            return None

    monkeypatch.setattr(pattern_scanner, "LEDGER_STORE", FakeStore())
    monkeypatch.setattr(pattern_scanner, "LEDGER_RECORD_STORE", FakeRecordStore())
    monkeypatch.setattr(pattern_scanner, "_get_entry_price", lambda symbol: 123.45)
    monkeypatch.setattr(pattern_scanner, "_detect_btc_trend", lambda: "bullish")
    monkeypatch.setattr(
        pattern_scanner,
        "score_entry_feature_snapshot",
        lambda snapshot, pattern_slug=None: PatternEntryScore(
            state="scored",
            p_win=0.73,
            model_key="tradoor-oi-reversal-v1:v1:1h:breakout_24h:fs1:lp1",
            model_version="20260414_010203",
            rollout_state="candidate",
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
    assert outcome.entry_model_key == "tradoor-oi-reversal-v1:v1:1h:breakout_24h:fs1:lp1"
    assert outcome.entry_model_version == "20260414_010203"
    assert outcome.entry_rollout_state == "candidate"
    assert outcome.entry_threshold == 0.55
    assert outcome.entry_threshold_passed is True
    assert outcome.feature_snapshot == {"ema20_slope": 0.1, "oi_change_1h": 0.2}
    assert len(entry_records) == 1
    assert len(score_records) == 1


def test_entry_candidate_records_include_transition_evidence(tmp_path, monkeypatch) -> None:
    store = PatternStateStore(tmp_path / "runtime.sqlite")
    monkeypatch.setattr(pattern_scanner, "STATE_STORE", store)
    # Ensure LEDGER_STORE is a local file store so the test doesn't hit Supabase
    from ledger.store import FileLedgerStore
    monkeypatch.setattr(pattern_scanner, "LEDGER_STORE", FileLedgerStore(tmp_path / "ledger"))
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


def test_entry_candidate_records_apply_gated_alert_policy(tmp_path, monkeypatch) -> None:
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

    class FakeLedger:
        def list_all(self, slug):
            return [
                PatternOutcome(
                    pattern_slug=slug,
                    symbol="PTBUSDT",
                    outcome="pending",
                    entry_transition_id=transition.transition_id,
                    entry_ml_state="scored",
                    entry_model_version="20260416_120000",
                    entry_rollout_state="active",
                    entry_threshold_passed=True,
                    entry_p_win=0.72,
                )
            ]

    class FakePolicy:
        mode = "gated"

    class FakePolicyStore:
        def load(self, slug):
            return FakePolicy()

    monkeypatch.setattr(pattern_scanner, "LEDGER_STORE", FakeLedger())
    monkeypatch.setattr(pattern_scanner, "ALERT_POLICY_STORE", FakePolicyStore())
    monkeypatch.setattr(
        pattern_scanner,
        "evaluate_alert_policy",
        lambda slug, outcome: type(
            "Decision",
            (),
            {"mode": "gated", "visible": True, "reason": "active_threshold_passed"},
        )(),
    )

    records_by_pattern = pattern_scanner.get_entry_candidate_records()
    record = records_by_pattern["tradoor-oi-reversal-v1"][0]

    assert record["alert_mode"] == "gated"
    assert record["alert_visible"] is True
    assert record["alert_reason"] == "active_threshold_passed"
    assert record["entry_rollout_state"] == "active"
    assert record["entry_threshold_passed"] is True


def test_visible_entry_candidates_filter_shadow_and_gated_blocks(tmp_path, monkeypatch) -> None:
    store = PatternStateStore(tmp_path / "runtime.sqlite")
    monkeypatch.setattr(pattern_scanner, "STATE_STORE", store)
    pattern_scanner._MACHINES.clear()

    first = PhaseTransition(
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        pattern_version=1,
        timeframe="1h",
        from_phase="REAL_DUMP",
        to_phase="ACCUMULATION",
        from_phase_idx=2,
        to_phase_idx=3,
        timestamp=datetime(2026, 4, 15, 2, 0, tzinfo=timezone.utc),
        scan_id="scan-1",
        is_entry_signal=True,
    )
    second = PhaseTransition(
        symbol="ETHUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        pattern_version=1,
        timeframe="1h",
        from_phase="REAL_DUMP",
        to_phase="ACCUMULATION",
        from_phase_idx=2,
        to_phase_idx=3,
        timestamp=datetime(2026, 4, 15, 3, 0, tzinfo=timezone.utc),
        scan_id="scan-2",
        is_entry_signal=True,
    )
    store.append_transition(first)
    store.append_transition(second)

    class FakeLedger:
        def list_all(self, slug):
            return [
                PatternOutcome(
                    pattern_slug=slug,
                    symbol="PTBUSDT",
                    outcome="pending",
                    entry_transition_id=first.transition_id,
                    entry_ml_state="scored",
                    entry_model_version="20260416_120000",
                    entry_rollout_state="active",
                    entry_threshold_passed=True,
                ),
                PatternOutcome(
                    pattern_slug=slug,
                    symbol="ETHUSDT",
                    outcome="pending",
                    entry_transition_id=second.transition_id,
                    entry_ml_state="scored",
                    entry_model_version="20260416_120000",
                    entry_rollout_state="candidate",
                    entry_threshold_passed=True,
                ),
            ]

    class FakePolicy:
        mode = "gated"

    class FakePolicyStore:
        def load(self, slug):
            return FakePolicy()

    monkeypatch.setattr(pattern_scanner, "LEDGER_STORE", FakeLedger())
    monkeypatch.setattr(pattern_scanner, "ALERT_POLICY_STORE", FakePolicyStore())
    monkeypatch.setattr(
        pattern_scanner,
        "evaluate_alert_policy",
        lambda slug, outcome: type(
            "Decision",
            (),
            {
                "mode": "gated",
                "visible": bool(outcome and outcome.entry_rollout_state == "active"),
                "reason": (
                    "active_threshold_passed"
                    if outcome and outcome.entry_rollout_state == "active"
                    else "non_active_rollout_score"
                ),
            },
        )(),
    )

    visible = pattern_scanner.get_entry_candidates_all()
    raw = pattern_scanner.get_raw_entry_candidates_all()

    assert visible["tradoor-oi-reversal-v1"] == ["PTBUSDT"]
    assert set(raw["tradoor-oi-reversal-v1"]) == {"PTBUSDT", "ETHUSDT"}


def test_on_phase_attempt_persists_failure_record(monkeypatch) -> None:
    attempts = []

    class FakeRecordStore:
        def append_phase_attempt_record(self, attempt):
            attempts.append(attempt)
            return None

    monkeypatch.setattr(pattern_scanner, "LEDGER_RECORD_STORE", FakeRecordStore())

    attempt = PhaseAttemptRecord(
        symbol="PTBUSDT",
        pattern_slug="tradoor-oi-reversal-v1",
        timeframe="1h",
        from_phase="REAL_DUMP",
        attempted_phase="ACCUMULATION",
        phase_score=0.64,
        missing_blocks=["positive_funding_bias"],
        failed_reason="below_score_threshold",
    )

    pattern_scanner._on_phase_attempt(attempt)

    assert len(attempts) == 1
    assert attempts[0].failed_reason == "below_score_threshold"
