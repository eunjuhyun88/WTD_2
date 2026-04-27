"""Tests for F-30: Ledger 4-table dual-write.

Covers:
- dual-write calls are made for verdict/outcome/entry/score
- dual-write failures are non-fatal (Supabase primary not affected)
- correct column mapping for each table
"""
from __future__ import annotations

from unittest.mock import MagicMock, call, patch


def _make_outcome(
    *,
    id: str = "out-001",
    capture_id: str = "cap-001",
    pattern_slug: str = "slug",
    user_id: str = "user-1",
    user_verdict: str = "valid",
    user_note: str | None = None,
    outcome: str = "success",
    max_gain_pct: float | None = 5.0,
    exit_return_pct: float | None = 3.5,
    duration_hours: float | None = 2.0,
    entry_price: float | None = 100.0,
    btc_trend_at_entry: str | None = "up",
    entry_p_win: float | None = 0.72,
    entry_model_key: str | None = "lgbm-v3",
    entry_threshold: float | None = 0.55,
    entry_threshold_passed: bool | None = True,
):
    m = MagicMock()
    m.id = id
    m.capture_id = capture_id
    m.pattern_slug = pattern_slug
    m.symbol = "BTCUSDT"
    m.user_id = user_id
    m.user_verdict = user_verdict
    m.user_note = user_note
    m.outcome = outcome
    m.max_gain_pct = max_gain_pct
    m.exit_return_pct = exit_return_pct
    m.duration_hours = duration_hours
    m.entry_price = entry_price
    m.btc_trend_at_entry = btc_trend_at_entry
    m.entry_p_win = entry_p_win
    m.entry_model_key = entry_model_key
    m.entry_model_version = "v3"
    m.entry_ml_state = "gated"
    m.entry_rollout_state = "A"
    m.entry_threshold = entry_threshold
    m.entry_threshold_passed = entry_threshold_passed
    m.entry_ml_error = None
    m.definition_id = None
    m.definition_ref = {}
    m.entry_transition_id = None
    m.entry_scan_id = None
    m.entry_block_coverage = None
    m.accumulation_at = None
    m.breakout_at = None
    m.invalidated_at = None
    m.peak_price = None
    m.exit_price = None
    return m


class TestVerdictDualWrite:
    def test_verdict_dual_write_called(self):
        from ledger.supabase_record_store import SupabaseLedgerRecordStore

        store = SupabaseLedgerRecordStore()
        mock_table = MagicMock()
        mock_table.upsert.return_value.execute.return_value = MagicMock()

        outcome = _make_outcome()

        with patch("ledger.supabase_record_store._sb") as mock_sb:
            mock_sb.return_value.table.return_value = mock_table
            store.append_verdict_record(outcome)

        # Should call both pattern_ledger_records and ledger_verdicts
        table_calls = [c.args[0] for c in mock_sb.return_value.table.call_args_list]
        assert "ledger_verdicts" in table_calls

    def test_verdict_row_mapping(self):
        from ledger.supabase_record_store import SupabaseLedgerRecordStore

        store = SupabaseLedgerRecordStore()
        captured_rows = {}

        def capture_upsert(row):
            captured_rows.update(row)
            m = MagicMock()
            m.execute.return_value = MagicMock()
            return m

        def table_dispatch(name):
            t = MagicMock()
            if name == "ledger_verdicts":
                t.upsert.side_effect = capture_upsert
            else:
                t.upsert.return_value.execute.return_value = MagicMock()
            return t

        outcome = _make_outcome(user_verdict="invalid", user_note="bad setup")

        with patch("ledger.supabase_record_store._sb") as mock_sb:
            mock_sb.return_value.table.side_effect = table_dispatch
            store.append_verdict_record(outcome)

        assert captured_rows["user_id"] == "user-1"
        assert captured_rows["verdict"] == "invalid"
        assert captured_rows["capture_id"] == "cap-001"
        assert captured_rows["outcome_id"] == "out-001"
        assert captured_rows["note"] == "bad setup"

    def test_verdict_dual_write_failure_nonfatal(self):
        from ledger.supabase_record_store import SupabaseLedgerRecordStore

        store = SupabaseLedgerRecordStore()
        call_count = [0]

        def table_dispatch(name):
            t = MagicMock()
            call_count[0] += 1
            if name == "ledger_verdicts":
                t.upsert.side_effect = RuntimeError("DB down")
            else:
                t.upsert.return_value.execute.return_value = MagicMock()
            return t

        outcome = _make_outcome()

        with patch("ledger.supabase_record_store._sb") as mock_sb:
            mock_sb.return_value.table.side_effect = table_dispatch
            # Must NOT raise
            store.append_verdict_record(outcome)

        assert call_count[0] >= 1


class TestOutcomeDualWrite:
    def test_outcome_row_mapping(self):
        from ledger.supabase_record_store import SupabaseLedgerRecordStore

        store = SupabaseLedgerRecordStore()
        captured_rows = {}

        def table_dispatch(name):
            t = MagicMock()
            if name == "ledger_outcomes":
                def cap(row):
                    captured_rows.update(row)
                    m = MagicMock()
                    m.execute.return_value = MagicMock()
                    return m
                t.upsert.side_effect = cap
            else:
                t.upsert.return_value.execute.return_value = MagicMock()
            return t

        outcome = _make_outcome(outcome="failure", max_gain_pct=1.2, exit_return_pct=-2.0)

        with patch("ledger.supabase_record_store._sb") as mock_sb:
            mock_sb.return_value.table.side_effect = table_dispatch
            store.append_outcome_record(outcome)

        assert captured_rows["outcome"] == "failure"
        assert captured_rows["capture_id"] == "cap-001"
        assert captured_rows["max_gain_pct"] == 1.2
        assert captured_rows["exit_return_pct"] == -2.0


class TestEntryDualWrite:
    def test_entry_row_mapping(self):
        from ledger.supabase_record_store import SupabaseLedgerRecordStore

        store = SupabaseLedgerRecordStore()
        captured_rows = {}

        def table_dispatch(name):
            t = MagicMock()
            if name == "ledger_entries":
                def cap(row):
                    captured_rows.update(row)
                    m = MagicMock()
                    m.execute.return_value = MagicMock()
                    return m
                t.upsert.side_effect = cap
            else:
                t.upsert.return_value.execute.return_value = MagicMock()
            return t

        outcome = _make_outcome(entry_price=42000.0, btc_trend_at_entry="down")

        with patch("ledger.supabase_record_store._sb") as mock_sb:
            mock_sb.return_value.table.side_effect = table_dispatch
            store.append_entry_record(outcome)

        assert captured_rows["entry_price"] == 42000.0
        assert captured_rows["btc_trend"] == "down"


class TestScoreDualWrite:
    def test_score_row_mapping(self):
        from ledger.supabase_record_store import SupabaseLedgerRecordStore

        store = SupabaseLedgerRecordStore()
        captured_rows = {}

        def table_dispatch(name):
            t = MagicMock()
            if name == "ledger_scores":
                def cap(row):
                    captured_rows.update(row)
                    m = MagicMock()
                    m.execute.return_value = MagicMock()
                    return m
                t.upsert.side_effect = cap
            else:
                t.upsert.return_value.execute.return_value = MagicMock()
            return t

        outcome = _make_outcome(entry_p_win=0.83, entry_model_key="lgbm-v4", entry_threshold=0.6, entry_threshold_passed=True)

        with patch("ledger.supabase_record_store._sb") as mock_sb:
            mock_sb.return_value.table.side_effect = table_dispatch
            store.append_score_record(outcome)

        assert captured_rows["p_win"] == 0.83
        assert captured_rows["model_key"] == "lgbm-v4"
        assert captured_rows["threshold"] == 0.6
        assert captured_rows["threshold_passed"] is True
