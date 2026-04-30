"""Tests for W-0233 — Ledger Phase 4 read path cutover."""
from __future__ import annotations
from unittest.mock import MagicMock, patch
import pytest

from ledger.supabase_record_store import SupabaseLedgerRecordStore, _TYPED_TABLE_MAP
from ledger.types import OutcomePayload, VerdictPayload


def _mock_sb_response(rows: list[dict]):
    """Mock Supabase client response."""
    resp = MagicMock()
    resp.data = rows
    chain = MagicMock()
    chain.execute.return_value = resp
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    return chain


# AC1: outcome → ledger_outcomes
def test_ac1_outcome_routes_to_typed_table():
    """list(slug, record_type='outcome') queries ledger_outcomes, not pattern_ledger_records."""
    store = SupabaseLedgerRecordStore()
    rows = [{
        "id": "abc123",
        "pattern_slug": "alpha-test-v1",
        "capture_id": "cap001",
        "outcome": "success",
        "max_gain_pct": 0.05,
        "exit_return_pct": 0.04,
        "duration_hours": 3.5,
        "created_at": "2026-04-30T00:00:00Z",
    }]

    with patch("ledger.supabase_record_store._sb") as mock_sb:
        mock_table = MagicMock()
        mock_sb.return_value.table.return_value = mock_table
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.execute.return_value = MagicMock(data=rows)

        records = store.list("alpha-test-v1", record_type="outcome")

    # Should have queried ledger_outcomes
    calls = [str(c) for c in mock_sb.return_value.table.call_args_list]
    assert any("ledger_outcomes" in c for c in calls), f"Expected ledger_outcomes query, got: {calls}"


# AC2: OutcomePayload.from_dict works on returned record
def test_ac2_outcome_payload_compatible():
    """Records from typed table reconstruct OutcomePayload correctly."""
    store = SupabaseLedgerRecordStore()
    rows = [{
        "id": "xyz789",
        "pattern_slug": "alpha-test-v1",
        "capture_id": "cap002",
        "outcome": "success",
        "max_gain_pct": 0.08,
        "exit_return_pct": 0.06,
        "duration_hours": 5.0,
        "created_at": "2026-04-30T00:00:00Z",
    }]

    with patch("ledger.supabase_record_store._sb") as mock_sb:
        mock_sb.return_value.table.return_value.select.return_value\
            .eq.return_value.order.return_value.execute.return_value = MagicMock(data=rows)

        records = store.list("alpha-test-v1", record_type="outcome")

    assert len(records) == 1
    payload = OutcomePayload.from_dict(records[0].payload)
    assert payload.outcome == "success"
    assert payload.exit_return_pct == pytest.approx(0.06)
    assert payload.duration_hours == pytest.approx(5.0)


# AC3: non-typed record_type stays on legacy path
def test_ac3_training_run_uses_legacy_table():
    """record_type='training_run' still queries pattern_ledger_records."""
    store = SupabaseLedgerRecordStore()

    with patch("ledger.supabase_record_store._sb") as mock_sb:
        mock_sb.return_value.table.return_value.select.return_value\
            .eq.return_value.order.return_value.execute.return_value = MagicMock(data=[])

        store.list("alpha-test-v1", record_type="training_run")

    calls = [str(c) for c in mock_sb.return_value.table.call_args_list]
    assert any("pattern_ledger_records" in c for c in calls), \
        f"Expected pattern_ledger_records for training_run, got: {calls}"


# AC4: typed table map contains all 4 types
def test_ac4_typed_table_map_complete():
    assert set(_TYPED_TABLE_MAP.keys()) == {"outcome", "verdict", "entry", "score"}


# AC5: verdict payload compatible
def test_ac5_verdict_payload_compatible():
    """Verdict record from ledger_verdicts reconstructs VerdictPayload."""
    store = SupabaseLedgerRecordStore()
    rows = [{
        "id": "vrd001",
        "pattern_slug": "alpha-test-v1",
        "capture_id": "cap003",
        "outcome_id": "out001",
        "user_id": "user_abc",
        "verdict": "valid",
        "note": "looks good",
        "created_at": "2026-04-30T00:00:00Z",
    }]

    with patch("ledger.supabase_record_store._sb") as mock_sb:
        mock_sb.return_value.table.return_value.select.return_value\
            .eq.return_value.order.return_value.execute.return_value = MagicMock(data=rows)

        records = store.list("alpha-test-v1", record_type="verdict")

    assert len(records) == 1
    payload = VerdictPayload.from_dict(records[0].payload)
    assert payload.user_verdict == "valid"
    assert payload.user_note == "looks good"
