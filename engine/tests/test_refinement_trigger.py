"""Tests for refinement_trigger.check_refinement_gates().

Uses injectable LedgerRecordStore so no scheduler or real pattern
refinement machinery is involved.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

import pytest

from ledger.store import LedgerRecordStore
from ledger.types import PatternLedgerRecord
from scanner.jobs.refinement_trigger import check_refinement_gates


def _store(tmp_path: Path) -> LedgerRecordStore:
    return LedgerRecordStore(base_dir=tmp_path / "ledger_records")


def _record(
    record_type: str,
    *,
    slug: str = "tradoor-oi-reversal-v1",
    created_at: datetime,
) -> PatternLedgerRecord:
    return PatternLedgerRecord(
        record_type=record_type,
        pattern_slug=slug,
        created_at=created_at,
        payload={},
    )


SLUG = "tradoor-oi-reversal-v1"
SLUGS = [SLUG]


def test_no_verdicts_not_eligible(tmp_path) -> None:
    store = _store(tmp_path)
    result = check_refinement_gates(
        now=datetime(2026, 4, 19),
        ledger_store=store,
        pattern_slugs=SLUGS,
        min_verdicts=10,
        min_days=7.0,
    )
    assert result == []


def test_enough_verdicts_no_prior_run_eligible(tmp_path) -> None:
    store = _store(tmp_path)
    now = datetime(2026, 4, 19, 12, 0)
    for i in range(10):
        store.append(_record("verdict", created_at=now - timedelta(days=i)))

    result = check_refinement_gates(
        now=now,
        ledger_store=store,
        pattern_slugs=SLUGS,
        min_verdicts=10,
        min_days=7.0,
    )
    assert result == [SLUG]


def test_within_day_gate_not_eligible(tmp_path) -> None:
    store = _store(tmp_path)
    now = datetime(2026, 4, 19, 12, 0)
    # Last training run was 3 days ago — below 7-day gate
    store.append(_record("training_run", created_at=now - timedelta(days=3)))
    for i in range(15):
        store.append(_record("verdict", created_at=now - timedelta(days=i)))

    result = check_refinement_gates(
        now=now,
        ledger_store=store,
        pattern_slugs=SLUGS,
        min_verdicts=10,
        min_days=7.0,
    )
    assert result == []


def test_past_day_gate_with_enough_new_verdicts_eligible(tmp_path) -> None:
    store = _store(tmp_path)
    now = datetime(2026, 4, 19, 12, 0)
    last_run_at = now - timedelta(days=8)
    store.append(_record("training_run", created_at=last_run_at))
    # 10 verdicts AFTER the last run
    for i in range(10):
        store.append(_record("verdict", created_at=last_run_at + timedelta(hours=i + 1)))

    result = check_refinement_gates(
        now=now,
        ledger_store=store,
        pattern_slugs=SLUGS,
        min_verdicts=10,
        min_days=7.0,
    )
    assert result == [SLUG]


def test_old_verdicts_before_last_run_do_not_count(tmp_path) -> None:
    store = _store(tmp_path)
    now = datetime(2026, 4, 19, 12, 0)
    last_run_at = now - timedelta(days=8)
    store.append(_record("training_run", created_at=last_run_at))
    # 12 verdicts BEFORE the last run — stale, should not count
    for i in range(12):
        store.append(_record("verdict", created_at=last_run_at - timedelta(hours=i + 1)))
    # Only 3 new verdicts AFTER the run — below threshold
    for i in range(3):
        store.append(_record("verdict", created_at=last_run_at + timedelta(hours=i + 1)))

    result = check_refinement_gates(
        now=now,
        ledger_store=store,
        pattern_slugs=SLUGS,
        min_verdicts=10,
        min_days=7.0,
    )
    assert result == []


def test_multiple_patterns_independent_gates(tmp_path) -> None:
    store = _store(tmp_path)
    now = datetime(2026, 4, 19, 12, 0)
    slug_a = "tradoor-oi-reversal-v1"
    slug_b = "tradoor-vol-squeeze-v1"

    # slug_a: 10 verdicts, no prior run → eligible
    for i in range(10):
        store.append(_record("verdict", slug=slug_a, created_at=now - timedelta(days=i)))

    # slug_b: only 5 verdicts → not eligible
    for i in range(5):
        store.append(_record("verdict", slug=slug_b, created_at=now - timedelta(days=i)))

    result = check_refinement_gates(
        now=now,
        ledger_store=store,
        pattern_slugs=[slug_a, slug_b],
        min_verdicts=10,
        min_days=7.0,
    )
    assert result == [slug_a]
