"""W-0385 PR2: Tests for formula_evidence_materializer."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, call, patch

from scanner.jobs.formula_evidence_materializer import _compute, materialize_all


def _period():
    end = datetime(2026, 1, 31, 0, tzinfo=timezone.utc)
    start = end - timedelta(days=30)
    return start, end


class TestCompute:
    def test_drag_score_correct(self):
        start, end = _period()
        rows = [
            {"forward_24h": 0.008},   # +80bps — winner
            {"forward_24h": 0.006},   # +60bps — winner
            {"forward_24h": -0.003},  # loser
            {"forward_24h": 0.001},   # not winner (< 50bps threshold)
        ]
        ev = _compute(rows, "filter_rule", "regime_mismatch", start, end)
        assert ev["sample_n"] == 4
        assert ev["blocked_winner_rate"] == 0.5       # 2/4
        assert ev["good_block_rate"] == 0.25           # 1/4
        assert ev["drag_score"] > 0
        # drag_score = blocked_winner_rate * avg_missed * 10000
        avg_missed = (0.008 + 0.006) / 2
        expected_drag = round(0.5 * avg_missed * 10000, 2)
        assert ev["drag_score"] == expected_drag

    def test_empty_forward_returns_empty(self):
        start, end = _period()
        rows = [{"forward_24h": None}, {"forward_24h": None}]
        ev = _compute(rows, "filter_rule", "anti_chase", start, end)
        assert ev == {}


class TestMaterializeAll:
    def _make_sb(self, rows: list[dict]):
        sb = MagicMock()
        sb.table.return_value.select.return_value.gte.return_value.lt.return_value.not_.is_.return_value.execute.return_value.data = rows
        sb.table.return_value.upsert.return_value.execute.return_value = None
        return sb

    def test_upsert_called_per_reason(self):
        rows = [
            {"reason": "regime_mismatch", "pattern_slug": None, "forward_24h": 0.008},
            {"reason": "regime_mismatch", "pattern_slug": None, "forward_24h": -0.003},
            {"reason": "anti_chase",      "pattern_slug": None, "forward_24h": 0.006},
        ]
        sb_mock = self._make_sb(rows)
        with patch("scanner.jobs.formula_evidence_materializer._sb", return_value=sb_mock):
            n = materialize_all(30)
        # 2 reason codes → 2 upsert calls
        assert n == 2
        upsert_calls = sb_mock.table.return_value.upsert.call_args_list
        assert len(upsert_calls) == 2

    def test_idempotent_upsert_conflict_clause(self):
        rows = [{"reason": "below_min_conviction", "pattern_slug": None, "forward_24h": 0.007}]
        sb_mock = self._make_sb(rows)
        with patch("scanner.jobs.formula_evidence_materializer._sb", return_value=sb_mock):
            materialize_all(30)
        _, kwargs = sb_mock.table.return_value.upsert.call_args
        assert kwargs.get("on_conflict") == "scope_kind,scope_value,period_start"

    def test_no_rows_returns_zero(self):
        sb_mock = self._make_sb([])
        with patch("scanner.jobs.formula_evidence_materializer._sb", return_value=sb_mock):
            n = materialize_all(30)
        assert n == 0
        sb_mock.table.return_value.upsert.assert_not_called()
