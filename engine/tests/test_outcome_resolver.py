"""Integration tests for engine.scanner.jobs.outcome_resolver.

Exercises the full Phase B pipeline using an in-memory CaptureStore +
LedgerStore and a fake klines loader. The resolver must:
  - skip captures that are still inside the evaluation window
  - apply the outcome policy to forward closes
  - create a PatternOutcome + LEDGER:outcome record
  - flip the capture to ``status='outcome_ready'`` with outcome_id set
  - leave captures with insufficient forward data as ``pending_outcome``
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd

from capture.store import CaptureStore
from capture.types import CaptureRecord
from ledger.store import LedgerRecordStore, LedgerStore
from scanner.jobs.outcome_resolver import resolve_outcomes


def _make_klines(start: datetime, closes: list[float]) -> pd.DataFrame:
    idx = pd.date_range(start, periods=len(closes), freq="1h", tz="UTC")
    return pd.DataFrame(
        {
            "open": closes,
            "high": [c * 1.01 for c in closes],
            "low": [c * 0.99 for c in closes],
            "close": closes,
            "volume": [1000.0] * len(closes),
        },
        index=idx,
    )


def _make_capture(
    *,
    capture_id: str,
    symbol: str,
    captured_at: datetime,
    pattern_slug: str = "tradoor-oi-reversal-v1",
) -> CaptureRecord:
    return CaptureRecord(
        capture_id=capture_id,
        capture_kind="pattern_candidate",
        user_id="user-1",
        symbol=symbol,
        pattern_slug=pattern_slug,
        pattern_version=1,
        phase="ACCUMULATION",
        timeframe="1h",
        captured_at_ms=int(captured_at.timestamp() * 1000),
        candidate_transition_id=f"transition-{capture_id}",
        scan_id=f"scan-{capture_id}",
        chart_context={"close": 100.0},
        feature_snapshot={"oi_change_1h": 0.18},
        block_scores={"funding_flip": {"passed": True, "score": 1.0}},
        status="pending_outcome",
    )


def test_resolver_promotes_success_capture(tmp_path) -> None:
    captures = CaptureStore(tmp_path / "capture.sqlite")
    ledger = LedgerStore(base_dir=tmp_path / "ledger_data")
    record_store = LedgerRecordStore(base_dir=tmp_path / "ledger_records")

    captured_at = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)
    capture = _make_capture(
        capture_id="cap-success",
        symbol="BTCUSDT",
        captured_at=captured_at,
    )
    captures.save(capture)

    # 80 hours of closes: +20% peak then partial fade.
    closes = [100.0] + [100.0 + i * 0.25 for i in range(1, 81)]  # ramps to 120
    klines = _make_klines(captured_at, closes)

    now_ms_val = int((captured_at + timedelta(hours=80)).timestamp() * 1000)
    resolved = resolve_outcomes(
        now_ms_val=now_ms_val,
        capture_store=captures,
        ledger_store=ledger,
        record_store=record_store,
        klines_loader=lambda symbol, tf, *, offline=True: klines,
    )

    assert len(resolved) == 1
    outcome = resolved[0]
    assert outcome.outcome == "success"
    assert outcome.symbol == "BTCUSDT"
    assert outcome.entry_price == 100.0
    assert outcome.max_gain_pct >= 0.15

    reloaded = captures.load(capture.capture_id)
    assert reloaded is not None
    assert reloaded.status == "outcome_ready"
    assert reloaded.outcome_id == outcome.id

    # LEDGER:outcome record appended
    outcome_records = record_store.list(
        capture.pattern_slug, record_type="outcome", symbol="BTCUSDT"
    )
    assert any(r.outcome_id == outcome.id for r in outcome_records)


def test_resolver_skips_captures_inside_window(tmp_path) -> None:
    captures = CaptureStore(tmp_path / "capture.sqlite")
    ledger = LedgerStore(base_dir=tmp_path / "ledger_data")
    record_store = LedgerRecordStore(base_dir=tmp_path / "ledger_records")

    captured_at = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)
    capture = _make_capture(
        capture_id="cap-fresh",
        symbol="ETHUSDT",
        captured_at=captured_at,
    )
    captures.save(capture)

    # Only 10 hours elapsed — still inside 72h window.
    now_ms_val = int((captured_at + timedelta(hours=10)).timestamp() * 1000)
    resolved = resolve_outcomes(
        now_ms_val=now_ms_val,
        capture_store=captures,
        ledger_store=ledger,
        record_store=record_store,
        klines_loader=lambda *a, **k: pd.DataFrame(),
    )

    assert resolved == []
    reloaded = captures.load(capture.capture_id)
    assert reloaded is not None
    assert reloaded.status == "pending_outcome"


def test_resolver_marks_failure_when_exit_below_miss(tmp_path) -> None:
    captures = CaptureStore(tmp_path / "capture.sqlite")
    ledger = LedgerStore(base_dir=tmp_path / "ledger_data")
    record_store = LedgerRecordStore(base_dir=tmp_path / "ledger_records")

    captured_at = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)
    capture = _make_capture(
        capture_id="cap-fail",
        symbol="SOLUSDT",
        captured_at=captured_at,
    )
    captures.save(capture)

    # entry 100 → slight pop to 102 → grind down to 80 (-20% exit).
    closes = [100.0, 102.0] + [100.0 - (i * 0.3) for i in range(1, 80)]
    klines = _make_klines(captured_at, closes)

    now_ms_val = int((captured_at + timedelta(hours=80)).timestamp() * 1000)
    resolved = resolve_outcomes(
        now_ms_val=now_ms_val,
        capture_store=captures,
        ledger_store=ledger,
        record_store=record_store,
        klines_loader=lambda *a, **k: klines,
    )

    assert len(resolved) == 1
    assert resolved[0].outcome == "failure"
    reloaded = captures.load(capture.capture_id)
    assert reloaded is not None
    assert reloaded.status == "outcome_ready"


def test_resolver_leaves_pending_when_no_forward_data(tmp_path) -> None:
    captures = CaptureStore(tmp_path / "capture.sqlite")
    ledger = LedgerStore(base_dir=tmp_path / "ledger_data")
    record_store = LedgerRecordStore(base_dir=tmp_path / "ledger_records")

    captured_at = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)
    capture = _make_capture(
        capture_id="cap-nodata",
        symbol="XRPUSDT",
        captured_at=captured_at,
    )
    captures.save(capture)

    now_ms_val = int((captured_at + timedelta(hours=80)).timestamp() * 1000)

    def _empty_loader(*args, **kwargs):
        return pd.DataFrame()

    resolved = resolve_outcomes(
        now_ms_val=now_ms_val,
        capture_store=captures,
        ledger_store=ledger,
        record_store=record_store,
        klines_loader=_empty_loader,
    )

    assert resolved == []
    reloaded = captures.load(capture.capture_id)
    assert reloaded is not None
    assert reloaded.status == "pending_outcome"


def test_resolver_idempotent_on_second_run(tmp_path) -> None:
    captures = CaptureStore(tmp_path / "capture.sqlite")
    ledger = LedgerStore(base_dir=tmp_path / "ledger_data")
    record_store = LedgerRecordStore(base_dir=tmp_path / "ledger_records")

    captured_at = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)
    capture = _make_capture(
        capture_id="cap-idem",
        symbol="BNBUSDT",
        captured_at=captured_at,
    )
    captures.save(capture)

    closes = [100.0] + [100.0 + i * 0.25 for i in range(1, 81)]
    klines = _make_klines(captured_at, closes)
    now_ms_val = int((captured_at + timedelta(hours=80)).timestamp() * 1000)
    loader = lambda *a, **k: klines

    first = resolve_outcomes(
        now_ms_val=now_ms_val,
        capture_store=captures,
        ledger_store=ledger,
        record_store=record_store,
        klines_loader=loader,
    )
    second = resolve_outcomes(
        now_ms_val=now_ms_val,
        capture_store=captures,
        ledger_store=ledger,
        record_store=record_store,
        klines_loader=loader,
    )

    assert len(first) == 1
    assert second == []  # status is now outcome_ready → skipped
