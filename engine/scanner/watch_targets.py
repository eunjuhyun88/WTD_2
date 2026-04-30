"""Watch scan target types for W-0335 core-loop closure.

WatchScanTarget carries per-capture metadata from CaptureStore.list(is_watching=True)
into the scanner, enabling watch-hit capture creation on block fires.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class WatchScanTarget:
    capture_id: str
    symbol: str
    timeframe: str
    pattern_slug: str | None
    definition_id: str | None


def load_watch_scan_targets(_store=None) -> list[WatchScanTarget]:
    """Read all is_watching=True captures and return as WatchScanTargets.

    Gracefully returns empty list if CaptureStore is unavailable.
    _store: optional injected CaptureStore (for testing).
    """
    try:
        if _store is None:
            from capture.store import CaptureStore
            _store = CaptureStore()
        captures = _store.list(is_watching=True, limit=200)
        return [
            WatchScanTarget(
                capture_id=c.capture_id,
                symbol=c.symbol,
                timeframe=c.timeframe or "1h",
                pattern_slug=c.pattern_slug or None,
                definition_id=c.definition_id,
            )
            for c in captures
            if c.symbol
        ]
    except Exception:
        return []


def create_watch_hit_capture(
    target: WatchScanTarget,
    blocks_triggered: list[str],
    features_df: pd.DataFrame,
    scan_id: str,
    _store=None,
) -> bool:
    """Create a pending_outcome CaptureRecord for a watch-hit event.

    Returns True on success, False on dedup/failure.

    Dedup rule: if a pending_outcome capture from the same source_watch_capture_id
    was created within the last 30 minutes, skip to avoid per-tick floods.
    """
    try:
        if _store is None:
            from capture.store import CaptureStore
            _store = CaptureStore()
        from capture.types import CaptureRecord

        store = _store

        # Dedup: skip if a recent pending watch-hit already exists for this source
        now_ms = int(time.time() * 1000)
        thirty_min_ms = 30 * 60 * 1000
        recent = store.list(symbol=target.symbol, status="pending_outcome", limit=20)
        for existing in recent:
            rc = existing.research_context or {}
            if (
                rc.get("source") == "watch_scan"
                and rc.get("source_watch_capture_id") == target.capture_id
                and (now_ms - existing.captured_at_ms) < thirty_min_ms
            ):
                return False  # already have a recent watch-hit for this source

        # Feature snapshot for last bar only (summary of triggered context)
        snap_dict: dict = {}
        if not features_df.empty:
            last = features_df.iloc[-1]
            for col in ("price", "rsi14", "funding_rate", "regime", "cvd_state", "total_perp_oi"):
                if col in last.index:
                    val = last[col]
                    snap_dict[col] = float(val) if hasattr(val, "item") else val

        record = CaptureRecord(
            capture_kind="pattern_candidate",
            symbol=target.symbol,
            pattern_slug=target.pattern_slug or "",
            definition_id=target.definition_id,
            timeframe=target.timeframe,
            status="pending_outcome",
            captured_at_ms=now_ms,
            scan_id=scan_id,
            block_scores={b: 1 for b in blocks_triggered},
            feature_snapshot=snap_dict if snap_dict else None,
            research_context={
                "source": "watch_scan",
                "source_watch_capture_id": target.capture_id,
                "scan_id": scan_id,
                "blocks_triggered": blocks_triggered,
            },
        )
        store.save(record)
        return True
    except Exception:
        return False
