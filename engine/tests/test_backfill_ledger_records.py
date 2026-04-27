"""Tests for scripts/backfill_ledger_records.py.

The script supports an injectable upsert callable so tests don't need a real
Supabase client.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import pytest

ENGINE_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ENGINE_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import backfill_ledger_records as bf  # noqa: E402

from ledger.store import FileLedgerStore, LedgerRecordStore  # noqa: E402
from ledger.types import PatternLedgerRecord, PatternOutcome  # noqa: E402


SLUG = "alpha-test-pattern-v1"


def _seed_outcome(base_dir: Path, *, slug: str = SLUG) -> PatternOutcome:
    store = FileLedgerStore(base_dir=base_dir)
    outcome = PatternOutcome(
        pattern_slug=slug,
        symbol="BTCUSDT",
        outcome="success",
        entry_price=100.0,
        peak_price=110.0,
        max_gain_pct=0.10,
    )
    store.save(outcome)
    return outcome


def _seed_record(base_dir: Path, *, slug: str = SLUG) -> PatternLedgerRecord:
    store = LedgerRecordStore(base_dir=base_dir)
    record = PatternLedgerRecord(
        record_type="entry",
        pattern_slug=slug,
        symbol="BTCUSDT",
        payload={"entry_price": 100.0},
    )
    store.append(record)
    return record


class TestDryRun:
    def test_outcomes_dry_run_counts_files_without_upsert(self, tmp_path: Path) -> None:
        outcomes_dir = tmp_path / "ledger_data"
        records_dir = tmp_path / "ledger_records"
        _seed_outcome(outcomes_dir)
        _seed_outcome(outcomes_dir)

        outcomes_result, records_result = bf.run(
            dry_run=True,
            do_outcomes=True,
            do_records=False,
            outcomes_dir=outcomes_dir,
            records_dir=records_dir,
        )

        assert outcomes_result is not None
        assert outcomes_result.scanned == 2
        assert outcomes_result.parsed == 2
        assert outcomes_result.upserted == 2  # would-upsert count
        assert outcomes_result.upsert_errors == 0
        assert records_result is None

    def test_records_dry_run_counts_files_without_upsert(self, tmp_path: Path) -> None:
        outcomes_dir = tmp_path / "ledger_data"
        records_dir = tmp_path / "ledger_records"
        _seed_record(records_dir)
        _seed_record(records_dir)
        _seed_record(records_dir)

        outcomes_result, records_result = bf.run(
            dry_run=True,
            do_outcomes=False,
            do_records=True,
            outcomes_dir=outcomes_dir,
            records_dir=records_dir,
        )

        assert records_result is not None
        assert records_result.scanned == 3
        assert records_result.parsed == 3
        assert records_result.upserted == 3
        assert outcomes_result is None


class TestApply:
    def test_apply_invokes_upsert_per_outcome(self, tmp_path: Path) -> None:
        outcomes_dir = tmp_path / "ledger_data"
        records_dir = tmp_path / "ledger_records"
        outcome_a = _seed_outcome(outcomes_dir)
        outcome_b = _seed_outcome(outcomes_dir)

        captured: list[dict] = []

        outcomes_result, _ = bf.run(
            dry_run=False,
            do_outcomes=True,
            do_records=False,
            outcomes_dir=outcomes_dir,
            records_dir=records_dir,
            outcomes_upsert=captured.append,
            records_upsert=lambda _: None,
        )

        assert len(captured) == 2
        ids_seen = {row["id"] for row in captured}
        assert ids_seen == {outcome_a.id, outcome_b.id}
        assert outcomes_result is not None
        assert outcomes_result.upserted == 2

    def test_apply_invokes_upsert_per_record(self, tmp_path: Path) -> None:
        outcomes_dir = tmp_path / "ledger_data"
        records_dir = tmp_path / "ledger_records"
        record_a = _seed_record(records_dir)
        record_b = _seed_record(records_dir)

        captured: list[dict] = []

        _, records_result = bf.run(
            dry_run=False,
            do_outcomes=False,
            do_records=True,
            outcomes_dir=outcomes_dir,
            records_dir=records_dir,
            outcomes_upsert=lambda _: None,
            records_upsert=captured.append,
        )

        assert len(captured) == 2
        ids_seen = {row["id"] for row in captured}
        assert ids_seen == {record_a.id, record_b.id}
        assert records_result is not None
        assert records_result.upserted == 2

    def test_apply_idempotent_rerun_resends_same_rows(self, tmp_path: Path) -> None:
        """Re-running should hit the same upsert calls — idempotency lives in
        Supabase upsert (PK = id), so the script just resends rows."""
        outcomes_dir = tmp_path / "ledger_data"
        records_dir = tmp_path / "ledger_records"
        outcome = _seed_outcome(outcomes_dir)

        captured: list[dict] = []

        for _ in range(2):
            bf.run(
                dry_run=False,
                do_outcomes=True,
                do_records=False,
                outcomes_dir=outcomes_dir,
                records_dir=records_dir,
                outcomes_upsert=captured.append,
                records_upsert=lambda _: None,
            )

        assert len(captured) == 2
        assert all(row["id"] == outcome.id for row in captured)


class TestErrorHandling:
    def test_upsert_failure_increments_counter_but_keeps_going(
        self, tmp_path: Path
    ) -> None:
        outcomes_dir = tmp_path / "ledger_data"
        records_dir = tmp_path / "ledger_records"
        _seed_outcome(outcomes_dir)
        _seed_outcome(outcomes_dir)

        calls = {"n": 0}

        def flaky(_row: dict) -> None:
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("simulated supabase 500")

        outcomes_result, _ = bf.run(
            dry_run=False,
            do_outcomes=True,
            do_records=False,
            outcomes_dir=outcomes_dir,
            records_dir=records_dir,
            outcomes_upsert=flaky,
            records_upsert=lambda _: None,
        )

        assert outcomes_result is not None
        assert outcomes_result.scanned == 2
        assert outcomes_result.parsed == 2
        assert outcomes_result.upserted == 1
        assert outcomes_result.upsert_errors == 1

    def test_corrupt_json_increments_parse_errors(self, tmp_path: Path) -> None:
        outcomes_dir = tmp_path / "ledger_data"
        records_dir = tmp_path / "ledger_records"
        _seed_outcome(outcomes_dir)

        corrupt_dir = outcomes_dir / SLUG
        corrupt_dir.mkdir(parents=True, exist_ok=True)
        (corrupt_dir / "broken.json").write_text("{not json")

        outcomes_result, _ = bf.run(
            dry_run=True,
            do_outcomes=True,
            do_records=False,
            outcomes_dir=outcomes_dir,
            records_dir=records_dir,
        )

        assert outcomes_result is not None
        assert outcomes_result.scanned == 2
        assert outcomes_result.parsed == 1
        assert outcomes_result.parse_errors == 1


class TestMainCli:
    def test_main_dry_run_default_returns_zero(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        outcomes_dir = tmp_path / "ledger_data"
        records_dir = tmp_path / "ledger_records"
        _seed_outcome(outcomes_dir)
        _seed_record(records_dir)

        rc = bf.main(
            [
                "--dry-run",
                "--outcomes-dir",
                str(outcomes_dir),
                "--records-dir",
                str(records_dir),
            ]
        )

        assert rc == 0
        captured = capsys.readouterr().out
        assert "mode=dry-run" in captured
        assert "[outcomes]" in captured
        assert "[records]" in captured

    def test_main_apply_returns_two_when_upsert_errors(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        outcomes_dir = tmp_path / "ledger_data"
        records_dir = tmp_path / "ledger_records"
        _seed_outcome(outcomes_dir)

        def flaky_outcomes(_: dict) -> None:
            raise RuntimeError("simulated")

        def silent_records(_: dict) -> None:
            return None

        def fake_make_upserters() -> tuple:
            return flaky_outcomes, silent_records

        monkeypatch.setattr(bf, "_make_supabase_upserters", fake_make_upserters)

        rc = bf.main(
            [
                "--apply",
                "--outcomes",
                "--outcomes-dir",
                str(outcomes_dir),
                "--records-dir",
                str(records_dir),
            ]
        )

        assert rc == 2
