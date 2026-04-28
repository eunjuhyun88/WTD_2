"""V-PV-01: paper verification executor unit tests."""
from __future__ import annotations

import math

import pytest

from verification.executor import run_paper_verification
from verification.types import PaperVerificationResult
from ledger.types import PatternLedgerRecord
from datetime import datetime


class _FakeStore:
    def __init__(self, records: list[PatternLedgerRecord]):
        self._records = records

    def list(self, slug, *, record_type=None, **_):
        return [
            r for r in self._records
            if r.pattern_slug == slug
            and (record_type is None or r.record_type == record_type)
        ]


def _outcome_record(slug, outcome, exit_return_pct, duration_hours=4.0, max_gain_pct=0.0):
    return PatternLedgerRecord(
        pattern_slug=slug,
        record_type="outcome",
        payload={
            "outcome": outcome,
            "exit_return_pct": exit_return_pct,
            "duration_hours": duration_hours,
            "max_gain_pct": max_gain_pct,
        },
        created_at=datetime.now(),
    )


def _make_store(slug, specs):
    records = [_outcome_record(slug, *s) for s in specs]
    return _FakeStore(records)


def test_empty_slug_returns_zero_trades():
    store = _FakeStore([])
    result = run_paper_verification("no-such-slug", store)
    assert result.n_trades == 0
    assert result.pass_gate is False


def test_win_rate_excludes_expired():
    store = _make_store("p", [
        ("hit", 0.05), ("hit", 0.03), ("miss", -0.02), ("expired", 0.0),
    ])
    result = run_paper_verification("p", store)
    assert result.n_trades == 4
    assert result.n_hit == 2
    assert result.n_expired == 1
    assert result.win_rate == pytest.approx(2 / 3)


def test_pass_gate_requires_10_trades_and_55_pct():
    specs = [("hit", 0.05)] * 8 + [("miss", -0.01)] * 4
    store = _make_store("p", specs)
    result = run_paper_verification("p", store)
    assert result.n_trades == 12
    assert result.pass_gate is True
    assert result.win_rate == pytest.approx(8 / 12)


def test_gate_fails_below_min_trades():
    specs = [("hit", 0.05)] * 5 + [("miss", -0.01)] * 3
    store = _make_store("p", specs)
    result = run_paper_verification("p", store)
    assert result.pass_gate is False
    assert any("n_trades" in r for r in result.gate_reasons)


def test_gate_fails_low_win_rate():
    specs = [("hit", 0.02)] * 4 + [("miss", -0.01)] * 8
    store = _make_store("p", specs)
    result = run_paper_verification("p", store)
    assert result.pass_gate is False
    assert any("win_rate" in r for r in result.gate_reasons)


def test_max_drawdown_is_negative_or_zero():
    specs = [("hit", 0.05), ("miss", -0.10), ("hit", 0.03)] * 4
    store = _make_store("p", specs)
    result = run_paper_verification("p", store)
    assert result.max_drawdown_pct <= 0.0


def test_sharpe_nan_for_single_trade():
    store = _make_store("p", [("hit", 0.05)])
    result = run_paper_verification("p", store)
    assert math.isnan(result.sharpe)


def test_avg_return_and_expectancy():
    store = _make_store("p", [("hit", 0.10), ("miss", -0.05)])
    result = run_paper_verification("p", store)
    assert result.avg_return_pct == pytest.approx(0.025)
    # win_rate=0.5, hit_avg=0.10, miss_avg=-0.05 → 0.5*0.10 + 0.5*(-0.05) = 0.025
    assert result.expectancy_pct == pytest.approx(0.025)


def test_run_paper_verification_reads_outcome_records():
    entry = PatternLedgerRecord(
        pattern_slug="p", record_type="entry",
        payload={}, created_at=datetime.now(),
    )
    outcomes = [_outcome_record("p", "hit", 0.05) for _ in range(10)]
    store = _FakeStore([entry] + outcomes)
    result = run_paper_verification("p", store)
    assert result.n_trades == 10
