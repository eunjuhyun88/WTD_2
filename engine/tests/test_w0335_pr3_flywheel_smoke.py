"""W-0335 PR-3: E2E flywheel smoke — watch → scan → outcome → verdict.

Verifies the entire core loop closes end-to-end with synthetic/mocked data:
  1. Create a source capture and mark it as watching
  2. watch-hit capture creation (create_watch_hit_capture)
  3. Outcome resolver converts the pending_outcome capture to outcome_ready
  4. User submits a verdict via the captures route
  5. compute_flywheel_health reflects the completed loop
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _make_klines(
    start: datetime,
    n: int = 100,
    freq: str = "1h",
    entry_price: float = 100.0,
    peak_factor: float = 1.20,
) -> pd.DataFrame:
    """Synthetic OHLCV klines. Close rises to peak_factor*entry at midpoint."""
    idx = pd.date_range(start, periods=n, freq=freq, tz="UTC")
    peak_bar = n // 2
    closes = [entry_price] * n
    for i in range(peak_bar, n):
        closes[i] = entry_price * peak_factor
    return pd.DataFrame(
        {
            "open": closes,
            "high": [c * 1.001 for c in closes],
            "low": [c * 0.999 for c in closes],
            "close": closes,
            "volume": [1000.0] * n,
        },
        index=idx,
    )


def _make_features(n: int = 10) -> pd.DataFrame:
    idx = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    return pd.DataFrame(
        {"close": np.full(n, 100.0), "rsi14": np.full(n, 50.0)},
        index=idx,
    )


def _attach_fake_auth(app: FastAPI) -> None:
    @app.middleware("http")
    async def _inject_test_user(request, call_next):
        request.state.user_id = "smoke-user"
        return await call_next(request)


# ---------------------------------------------------------------------------
# Step 1–2: watch → watch-hit capture
# ---------------------------------------------------------------------------

class TestWatchHitCaptureCreation:
    def test_watch_hit_creates_pending_outcome_capture(self, tmp_path):
        from capture.store import CaptureStore
        from capture.types import CaptureRecord
        from scanner.watch_targets import WatchScanTarget, create_watch_hit_capture

        store = CaptureStore(db_path=str(tmp_path / "c.db"))

        source = CaptureRecord(
            symbol="BTCUSDT",
            pattern_slug="tradoor-oi-reversal-v1",
            timeframe="1h",
            captured_at_ms=int(time.time() * 1000),
            is_watching=True,
        )
        store.save(source)
        store.set_watching(source.capture_id, watching=True)

        target = WatchScanTarget(
            capture_id=source.capture_id,
            symbol="BTCUSDT",
            timeframe="1h",
            pattern_slug="tradoor-oi-reversal-v1",
            definition_id=None,
        )
        ok = create_watch_hit_capture(
            target,
            ["bullish_engulfing", "volume_spike", "oi_expansion_confirm"],
            _make_features(),
            "scan-smoke-001",
            _store=store,
        )
        assert ok is True

        all_pending = store.list(symbol="BTCUSDT", status="pending_outcome")
        pending = [c for c in all_pending if (c.research_context or {}).get("source") == "watch_scan"]
        assert len(pending) == 1
        rc = pending[0].research_context or {}
        assert rc["source"] == "watch_scan"
        assert rc["source_watch_capture_id"] == source.capture_id
        assert "bullish_engulfing" in rc["blocks_triggered"]


# ---------------------------------------------------------------------------
# Step 3: outcome resolver
# ---------------------------------------------------------------------------

class TestOutcomeResolution:
    def test_resolver_converts_pending_to_outcome_ready(self, tmp_path):
        from capture.store import CaptureStore
        from capture.types import CaptureRecord
        from ledger.store import LedgerStore, LedgerRecordStore
        from scanner.jobs.outcome_resolver import resolve_outcomes

        capture_store = CaptureStore(db_path=str(tmp_path / "c.db"))
        ledger_store = LedgerStore(tmp_path / "ledger")
        record_store = LedgerRecordStore(tmp_path / "records.jsonl")

        eval_window_h = 72.0
        age_ms = int((eval_window_h + 1) * 3600 * 1000)
        captured_at_ms = int(time.time() * 1000) - age_ms
        captured_at = datetime.fromtimestamp(captured_at_ms / 1000, tz=timezone.utc)
        now_ms = int(time.time() * 1000)

        capture = CaptureRecord(
            symbol="BTCUSDT",
            pattern_slug="tradoor-oi-reversal-v1",
            timeframe="1h",
            status="pending_outcome",
            captured_at_ms=captured_at_ms,
            research_context={"source": "watch_scan", "source_watch_capture_id": "src-001"},
        )
        capture_store.save(capture)

        klines_start = captured_at - timedelta(hours=10)
        klines = _make_klines(klines_start, n=100, freq="1h", entry_price=100.0, peak_factor=1.20)

        def _fake_loader(symbol: str, timeframe: str, *, offline: bool = True):
            return klines

        outcomes = resolve_outcomes(
            now_ms_val=now_ms,
            capture_store=capture_store,
            ledger_store=ledger_store,
            record_store=record_store,
            klines_loader=_fake_loader,
        )

        assert len(outcomes) == 1
        assert outcomes[0].outcome == "success"

        resolved = capture_store.load(capture.capture_id)
        assert resolved is not None
        assert resolved.status == "outcome_ready"
        assert resolved.outcome_id is not None


# ---------------------------------------------------------------------------
# Step 4: verdict via HTTP route
# ---------------------------------------------------------------------------

class TestVerdictSubmission:
    def _build_client(self, tmp_path, monkeypatch):
        from api.routes import captures
        from capture.store import CaptureStore
        from ledger.store import LedgerStore
        from patterns.state_store import PatternStateStore

        capture_store = CaptureStore(tmp_path / "capture.sqlite")
        state_store = PatternStateStore(tmp_path / "runtime.sqlite")
        ledger_store = LedgerStore(tmp_path / "ledger")

        verdict_records: list = []

        class FakeRecordStore:
            def append_capture_record(self, r):
                pass

            def append_verdict_record(self, o):
                verdict_records.append(o)

        monkeypatch.setattr(captures, "_capture_store", capture_store)
        monkeypatch.setattr(captures, "_state_store", state_store)
        monkeypatch.setattr(captures, "_ledger_store", ledger_store)
        monkeypatch.setattr(captures, "LEDGER_RECORD_STORE", FakeRecordStore())

        app = FastAPI()
        app.include_router(captures.router, prefix="/captures")
        _attach_fake_auth(app)
        client = TestClient(app)
        client.capture_store = capture_store  # type: ignore[attr-defined]
        client.ledger_store = ledger_store  # type: ignore[attr-defined]
        client.verdict_records = verdict_records  # type: ignore[attr-defined]
        return client

    def test_verdict_marks_capture_verdict_ready(self, tmp_path, monkeypatch):
        from capture.types import CaptureRecord
        from ledger.types import PatternOutcome

        client = self._build_client(tmp_path, monkeypatch)

        outcome = PatternOutcome(
            pattern_slug="tradoor-oi-reversal-v1",
            symbol="BTCUSDT",
            accumulation_at=datetime.now(tz=timezone.utc),
            entry_price=100.0,
            peak_price=120.0,
            exit_price=120.0,
            outcome="success",
            max_gain_pct=0.20,
            exit_return_pct=0.20,
        )
        client.ledger_store.save(outcome)

        capture = CaptureRecord(
            symbol="BTCUSDT",
            pattern_slug="tradoor-oi-reversal-v1",
            timeframe="1h",
            captured_at_ms=int(time.time() * 1000),
            status="outcome_ready",
            outcome_id=outcome.id,
        )
        client.capture_store.save(capture)

        resp = client.post(
            f"/captures/{capture.capture_id}/verdict",
            json={"verdict": "valid", "user_note": "watch-hit confirmed"},
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        assert resp.json()["user_verdict"] == "valid"

        reloaded = client.capture_store.load(capture.capture_id)
        assert reloaded.status == "verdict_ready"


# ---------------------------------------------------------------------------
# Step 5: flywheel health reflects completed loop
# ---------------------------------------------------------------------------

class TestFlywheelHealthReflectsLoop:
    def test_flywheel_rates_positive_after_full_loop(self, tmp_path):
        from capture.store import CaptureStore
        from capture.types import CaptureRecord
        from ledger.store import LedgerStore, LedgerRecordStore
        from ledger.types import PatternOutcome
        from api.routes.observability import compute_flywheel_health

        capture_store = CaptureStore(db_path=str(tmp_path / "c.db"))
        ledger_store = LedgerStore(tmp_path / "ledger")
        record_store = LedgerRecordStore(tmp_path / "records.jsonl")

        outcome = PatternOutcome(
            pattern_slug="tradoor-oi-reversal-v1",
            symbol="BTCUSDT",
            accumulation_at=datetime.now(tz=timezone.utc),
            entry_price=100.0,
            peak_price=120.0,
            exit_price=120.0,
            outcome="success",
            max_gain_pct=0.20,
            exit_return_pct=0.20,
            user_verdict="valid",
        )
        ledger_store.save(outcome)
        record_store.append_outcome_record(outcome)
        record_store.append_verdict_record(outcome)

        capture = CaptureRecord(
            symbol="BTCUSDT",
            pattern_slug="tradoor-oi-reversal-v1",
            timeframe="1h",
            captured_at_ms=int(time.time() * 1000),
            status="verdict_ready",
            outcome_id=outcome.id,
        )
        capture_store.save(capture)
        record_store.append_capture_record(capture)

        health = compute_flywheel_health(
            capture_store=capture_store,
            record_store=record_store,
        )

        assert health["captures_to_outcome_rate"] == 1.0
        assert health["outcomes_to_verdict_rate"] == 1.0


# ---------------------------------------------------------------------------
# Full E2E smoke — all 5 steps in one test
# ---------------------------------------------------------------------------

class TestFullWatchToVerdictSmoke:
    def test_watch_to_verdict_end_to_end(self, tmp_path, monkeypatch):
        """Golden path: watch → scan hit → outcome resolved → verdict → flywheel."""
        from capture.store import CaptureStore
        from capture.types import CaptureRecord
        from ledger.store import LedgerStore, LedgerRecordStore
        from scanner.watch_targets import WatchScanTarget, create_watch_hit_capture
        from scanner.jobs.outcome_resolver import resolve_outcomes
        from api.routes.observability import compute_flywheel_health
        from api.routes import captures
        from patterns.state_store import PatternStateStore

        capture_store = CaptureStore(db_path=str(tmp_path / "c.db"))
        ledger_store = LedgerStore(tmp_path / "ledger")
        record_store = LedgerRecordStore(tmp_path / "records.jsonl")
        state_store = PatternStateStore(tmp_path / "runtime.sqlite")

        class FakeRecordStore:
            def append_capture_record(self, r):
                record_store.append_capture_record(r)
            def append_verdict_record(self, o):
                record_store.append_verdict_record(o)
            def append_outcome_record(self, o):
                record_store.append_outcome_record(o)

        monkeypatch.setattr(captures, "_capture_store", capture_store)
        monkeypatch.setattr(captures, "_state_store", state_store)
        monkeypatch.setattr(captures, "_ledger_store", ledger_store)
        monkeypatch.setattr(captures, "LEDGER_RECORD_STORE", FakeRecordStore())
        app = FastAPI()
        app.include_router(captures.router, prefix="/captures")
        _attach_fake_auth(app)
        http = TestClient(app)

        # STEP 1: source capture, mark watching
        # Use status="outcome_ready" so the resolver doesn't pick it up
        source = CaptureRecord(
            symbol="BTCUSDT",
            pattern_slug="tradoor-oi-reversal-v1",
            timeframe="1h",
            captured_at_ms=int(time.time() * 1000),
            status="outcome_ready",
            is_watching=True,
        )
        capture_store.save(source)
        capture_store.set_watching(source.capture_id, watching=True)
        record_store.append_capture_record(source)

        # STEP 2: scanner fires watch-hit → pending_outcome capture
        target = WatchScanTarget(
            capture_id=source.capture_id,
            symbol="BTCUSDT",
            timeframe="1h",
            pattern_slug="tradoor-oi-reversal-v1",
            definition_id=None,
        )
        ok = create_watch_hit_capture(
            target,
            ["bullish_engulfing", "oi_expansion_confirm"],
            _make_features(),
            "scan-e2e-001",
            _store=capture_store,
        )
        assert ok is True

        all_pending = capture_store.list(symbol="BTCUSDT", status="pending_outcome")
        pending = [c for c in all_pending if (c.research_context or {}).get("source") == "watch_scan"]
        assert len(pending) == 1
        pending_cap = pending[0]
        record_store.append_capture_record(pending_cap)

        # STEP 3: advance time past evaluation window, resolve outcome
        eval_window_h = 72.0
        age_ms = int((eval_window_h + 1) * 3600 * 1000)
        now_ms_sim = pending_cap.captured_at_ms + age_ms
        captured_at = datetime.fromtimestamp(pending_cap.captured_at_ms / 1000, tz=timezone.utc)

        klines = _make_klines(
            start=captured_at - timedelta(hours=10),
            n=100,
            freq="1h",
            entry_price=100.0,
            peak_factor=1.20,  # +20% → success
        )

        def _fake_loader(symbol: str, timeframe: str, *, offline: bool = True):
            return klines

        outcomes = resolve_outcomes(
            now_ms_val=now_ms_sim,
            capture_store=capture_store,
            ledger_store=ledger_store,
            record_store=record_store,
            klines_loader=_fake_loader,
        )
        assert len(outcomes) == 1
        assert outcomes[0].outcome == "success"

        resolved_cap = capture_store.load(pending_cap.capture_id)
        assert resolved_cap.status == "outcome_ready"

        # STEP 4: user submits verdict via HTTP
        resp = http.post(
            f"/captures/{pending_cap.capture_id}/verdict",
            json={"verdict": "valid", "user_note": "confirmed — clean breakout"},
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        final_cap = capture_store.load(pending_cap.capture_id)
        assert final_cap.status == "verdict_ready"

        # STEP 5: flywheel health sees the completed loop
        health = compute_flywheel_health(
            capture_store=capture_store,
            record_store=record_store,
        )
        assert health["captures_to_outcome_rate"] > 0, (
            f"Expected positive outcome rate, got {health}"
        )
        assert health["outcomes_to_verdict_rate"] > 0, (
            f"Expected positive verdict rate, got {health}"
        )
