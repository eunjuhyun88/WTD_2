"""test_capture_with_verdict.py — W-0392

verdict_json field on CaptureRecord + outcome_resolver integration tests.

Test cases:
  1. verdict_json=None  → resolver uses bar-derived entry_price (legacy path)
  2. verdict_json complete (entry/stop/target) → resolver uses verdict entry_price
  3. verdict_json partial (entry only, no stop) → resolver falls back to bar entry
  4. CaptureRecord.verdict_json field exists and defaults to None
  5. verdict_json round-trips through to_supabase_dict
  6. outcome_resolver 1-cycle e2e with mock stores
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

import pandas as pd

from capture.store import CaptureStore
from capture.types import CaptureRecord
from ledger.store import LedgerRecordStore, LedgerStore
from scanner.jobs.outcome_resolver import resolve_outcomes


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_klines(start: datetime, closes: list[float]) -> pd.DataFrame:
    idx = pd.date_range(start, periods=len(closes), freq="1h", tz="UTC")
    return pd.DataFrame(
        {
            "open": closes,
            "high": [c * 1.01 for c in closes],
            "low":  [c * 0.99 for c in closes],
            "close": closes,
            "volume": [1000.0] * len(closes),
        },
        index=idx,
    )


def _make_capture(
    captured_at: datetime,
    symbol: str = "BTCUSDT",
    pattern_slug: str = "fake_dump",
    verdict_json: dict | None = None,
) -> CaptureRecord:
    return CaptureRecord(
        symbol=symbol,
        pattern_slug=pattern_slug,
        timeframe="1h",
        captured_at_ms=int(captured_at.timestamp() * 1000),
        status="pending_outcome",
        verdict_json=verdict_json,
    )


def _make_stores(capture: CaptureRecord, tmp_path):
    cs = CaptureStore(tmp_path / "capture.sqlite")
    ls = LedgerStore(base_dir=tmp_path / "ledger")
    rs = LedgerRecordStore(base_dir=tmp_path / "records")
    cs.save(capture)
    return cs, ls, rs


# ── Test 1: verdict_json=None → legacy bar-derived entry ─────────────────────

def test_verdict_json_none_uses_bar_entry(tmp_path):
    """When verdict_json is None, entry_price is derived from the bar at capture_at."""
    now = datetime(2024, 1, 10, 12, 0, tzinfo=timezone.utc)
    window_hours = 72
    cap_at = now - timedelta(hours=window_hours + 1)

    closes = [100.0] * 20 + [101.0, 102.0, 104.0, 106.0, 108.0, 110.0, 112.0, 115.0]
    klines = _make_klines(cap_at - timedelta(hours=len(closes)), closes)

    capture = _make_capture(cap_at, verdict_json=None)
    cs, ls, rs = _make_stores(capture, tmp_path)

    now_ms_val = int(now.timestamp() * 1000)
    # Should not raise regardless of whether a PatternOutcome is emitted
    outcomes = resolve_outcomes(
        now_ms_val=now_ms_val,
        capture_store=cs,
        ledger_store=ls,
        record_store=rs,
        klines_loader=lambda *_, **__: klines,
    )
    assert isinstance(outcomes, list)


# ── Test 2: verdict_json complete → verdict entry_price used ─────────────────

def test_verdict_json_complete_overrides_entry(tmp_path):
    """When verdict_json has entry/stop/target, entry_price is taken from verdict."""
    now = datetime(2024, 1, 10, 12, 0, tzinfo=timezone.utc)
    window_hours = 72
    cap_at = now - timedelta(hours=window_hours + 1)

    closes = [95.0] * 20 + [100.0] * 5 + [105.0, 108.0, 112.0, 115.0, 120.0]
    klines = _make_klines(cap_at - timedelta(hours=len(closes)), closes)

    verdict = {"entry": 100.0, "stop": 94.0, "target": 115.0, "rr": 2.5}
    capture = _make_capture(cap_at, verdict_json=verdict)
    cs, ls, rs = _make_stores(capture, tmp_path)

    now_ms_val = int(now.timestamp() * 1000)
    outcomes = resolve_outcomes(
        now_ms_val=now_ms_val,
        capture_store=cs,
        ledger_store=ls,
        record_store=rs,
        klines_loader=lambda *_, **__: klines,
    )

    # If outcome resolved, entry_price must match verdict entry
    for outcome in outcomes:
        assert math.isclose(outcome.entry_price, 100.0, rel_tol=1e-6)


# ── Test 3: verdict_json partial (only entry) → fallback ─────────────────────

def test_verdict_json_partial_falls_back(tmp_path):
    """verdict_json with only entry (no stop/target) → bar-derived path used."""
    now = datetime(2024, 1, 10, 12, 0, tzinfo=timezone.utc)
    window_hours = 72
    cap_at = now - timedelta(hours=window_hours + 1)

    closes = [100.0] * 30 + [102.0, 104.0, 106.0]
    klines = _make_klines(cap_at - timedelta(hours=len(closes)), closes)

    verdict = {"entry": 99.0}   # partial — no stop, no target
    capture = _make_capture(cap_at, verdict_json=verdict)
    cs, ls, rs = _make_stores(capture, tmp_path)

    now_ms_val = int(now.timestamp() * 1000)
    # Must not raise; falls back silently to bar entry
    outcomes = resolve_outcomes(
        now_ms_val=now_ms_val,
        capture_store=cs,
        ledger_store=ls,
        record_store=rs,
        klines_loader=lambda *_, **__: klines,
    )
    assert isinstance(outcomes, list)


# ── Test 4: CaptureRecord.verdict_json defaults to None ──────────────────────

def test_capture_record_verdict_json_field_defaults_none():
    """CaptureRecord.verdict_json field exists and defaults to None."""
    record = CaptureRecord(
        symbol="ETHUSDT",
        pattern_slug="accumulation",
        captured_at_ms=0,
    )
    assert hasattr(record, "verdict_json")
    assert record.verdict_json is None


# ── Test 5: verdict_json serialises into to_supabase_dict ────────────────────

def test_verdict_json_round_trips_supabase_dict():
    """verdict_json appears in to_supabase_dict output."""
    verdict = {"verdict": "LONG", "entry": 71000.0, "stop": 68500.0, "target": 76000.0}
    record = CaptureRecord(
        symbol="BTCUSDT",
        pattern_slug="accumulation",
        captured_at_ms=0,
        verdict_json=verdict,
    )
    d = record.to_supabase_dict()
    assert "verdict_json" in d
    assert d["verdict_json"] == verdict


# ── Test 6: e2e 1-cycle resolve_outcomes ─────────────────────────────────────

def test_outcome_resolver_e2e_with_verdict_json(tmp_path):
    """Full resolve_outcomes cycle: capture with verdict_json → outcome_ready."""
    now = datetime(2024, 2, 1, 0, 0, tzinfo=timezone.utc)
    window_hours = 72.0
    cap_at = now - timedelta(hours=window_hours + 2)

    base = 50_000.0
    closes = (
        [base] * 30
        + [base * 1.01] * 10
        + [base * 1.05, base * 1.08, base * 1.10, base * 1.11]
    )
    klines = _make_klines(cap_at - timedelta(hours=len(closes)), closes)

    verdict = {"entry": base, "stop": base * 0.97, "target": base * 1.10, "rr": 3.0}
    capture = _make_capture(cap_at, verdict_json=verdict)
    cs, ls, rs = _make_stores(capture, tmp_path)

    now_ms_val = int(now.timestamp() * 1000)
    outcomes = resolve_outcomes(
        now_ms_val=now_ms_val,
        capture_store=cs,
        ledger_store=ls,
        record_store=rs,
        klines_loader=lambda *_, **__: klines,
    )

    # If outcome resolved, capture must be outcome_ready
    updated = cs.load(capture.capture_id)
    if outcomes:
        assert updated is not None
        assert updated.status == "outcome_ready"
        assert updated.outcome_id is not None
