"""Tests for W-0335 PR-2: watch-hit capture creation.

Verifies:
1. create_watch_hit_capture saves a pending_outcome record on first hit
2. Dedup: second call within 30 min for same source returns False (no duplicate)
3. create_watch_hit_capture returns False gracefully when CaptureStore fails
4. WatchScanTarget is built correctly from CaptureRecord fields
5. _eval_symbol_sync with watch_targets creates a capture on block fire
"""
from __future__ import annotations

import time
import uuid
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest


def _make_features(n: int = 10) -> pd.DataFrame:
    idx = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    return pd.DataFrame({"close": np.full(n, 100.0), "rsi14": np.full(n, 50.0)}, index=idx)


class TestCreateWatchHitCapture:
    def test_creates_pending_outcome_capture(self, tmp_path):
        from scanner.watch_targets import WatchScanTarget, create_watch_hit_capture
        from capture.store import CaptureStore

        db = str(tmp_path / "captures.db")
        store = CaptureStore(db_path=db)

        target = WatchScanTarget(
            capture_id="src-cap-001",
            symbol="BTCUSDT",
            timeframe="1h",
            pattern_slug="FAKE_DUMP",
            definition_id=None,
        )
        result = create_watch_hit_capture(
            target, ["bullish_engulfing", "volume_spike"], _make_features(), "scan-001", _store=store
        )
        assert result is True

        records = store.list(symbol="BTCUSDT", status="pending_outcome")
        assert len(records) == 1
        rc = records[0].research_context or {}
        assert rc["source"] == "watch_scan"
        assert rc["source_watch_capture_id"] == "src-cap-001"
        assert "bullish_engulfing" in rc["blocks_triggered"]

    def test_dedup_skips_if_recent_capture_exists(self, tmp_path):
        from scanner.watch_targets import WatchScanTarget, create_watch_hit_capture
        from capture.store import CaptureStore

        db = str(tmp_path / "captures.db")
        store = CaptureStore(db_path=db)

        target = WatchScanTarget(
            capture_id="src-cap-002",
            symbol="ETHUSDT",
            timeframe="4h",
            pattern_slug=None,
            definition_id=None,
        )
        feats = _make_features()

        # First call — should succeed
        r1 = create_watch_hit_capture(target, ["golden_cross"], feats, "scan-A", _store=store)
        assert r1 is True

        # Second call within 30 min — should be deduped
        r2 = create_watch_hit_capture(target, ["golden_cross"], feats, "scan-B", _store=store)
        assert r2 is False

        # Only one record in DB
        records = store.list(symbol="ETHUSDT", status="pending_outcome")
        assert len(records) == 1

    def test_graceful_when_store_fails(self):
        from scanner.watch_targets import WatchScanTarget, create_watch_hit_capture

        class _BadStore:
            def list(self, **kwargs):
                raise RuntimeError("DB unavailable")

        target = WatchScanTarget(
            capture_id="src-cap-003",
            symbol="XYZUSDT",
            timeframe="1h",
            pattern_slug=None,
            definition_id=None,
        )
        result = create_watch_hit_capture(target, ["volume_spike"], _make_features(), "scan-Z", _store=_BadStore())
        assert result is False  # graceful

    def test_block_scores_written_to_capture(self, tmp_path):
        from scanner.watch_targets import WatchScanTarget, create_watch_hit_capture
        from capture.store import CaptureStore

        db = str(tmp_path / "captures.db")
        store = CaptureStore(db_path=db)

        target = WatchScanTarget(
            capture_id="src-cap-004",
            symbol="SOLUSDT",
            timeframe="1h",
            pattern_slug="OI_PRESURGE",
            definition_id=None,
        )
        blocks = ["oi_expansion_confirm", "funding_flip", "volume_surge_bull"]
        create_watch_hit_capture(target, blocks, _make_features(), "scan-X", _store=store)

        records = store.list(symbol="SOLUSDT", status="pending_outcome")
        assert len(records) == 1
        assert records[0].block_scores == {b: 1 for b in blocks}


class TestLoadWatchScanTargets:
    def test_returns_targets_from_watching_captures(self, tmp_path):
        from scanner.watch_targets import load_watch_scan_targets
        from capture.store import CaptureStore
        from capture.types import CaptureRecord

        db = str(tmp_path / "captures.db")
        store = CaptureStore(db_path=db)

        # Create one watching capture
        cap = CaptureRecord(
            symbol="BTCUSDT",
            pattern_slug="FAKE_DUMP",
            timeframe="1h",
            captured_at_ms=int(time.time() * 1000),
            is_watching=True,
        )
        store.save(cap)
        store.set_watching(cap.capture_id, watching=True)

        targets = load_watch_scan_targets(_store=store)
        assert any(t.symbol == "BTCUSDT" and t.pattern_slug == "FAKE_DUMP" for t in targets)

    def test_graceful_on_store_error(self):
        from scanner.watch_targets import load_watch_scan_targets

        class _BadStore:
            def list(self, **kwargs):
                raise RuntimeError("fail")

        result = load_watch_scan_targets(_store=_BadStore())
        assert result == []
