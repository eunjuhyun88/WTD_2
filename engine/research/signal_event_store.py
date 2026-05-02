"""W-0367/W-0368: Supabase store for scan_signal_events + outcomes.

Phase 2 (W-0368) additions:
- DLQ: scan_signal_events_dlq for failed inserts
- Retry FSM: 3 attempts with exponential backoff (60s/300s/900s)
- Batch UPSERT: buffer up to 100 events, flush as single transaction
- Circuit breaker: 10 failures/5min → OPEN (1h) → HALF-OPEN → CLOSED
"""
from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any

log = logging.getLogger("engine.research.signal_event_store")

SIGNAL_EVENTS_TABLE = "scan_signal_events"
SIGNAL_OUTCOMES_TABLE = "scan_signal_outcomes"
SIGNAL_DLQ_TABLE = "scan_signal_events_dlq"
HORIZONS = [1, 4, 24, 72]

_RETRY_BACKOFFS = [60, 300, 900]  # seconds: attempt 0→1→2→DLQ


# ---------------------------------------------------------------------------
# Circuit Breaker
# ---------------------------------------------------------------------------
class _CircuitBreaker:
    """Thread-safe circuit breaker: CLOSED → OPEN → HALF-OPEN → CLOSED."""

    FAILURE_THRESHOLD = 10
    FAILURE_WINDOW_S = 300  # 5 min
    OPEN_DURATION_S = 3600  # 1 h

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._failures: deque[float] = deque()
        self._state = "CLOSED"  # CLOSED | OPEN | HALF-OPEN
        self._opened_at: float | None = None

    @property
    def state(self) -> str:
        return self._state

    def allow(self) -> bool:
        """Return True if the call should proceed."""
        with self._lock:
            now = time.monotonic()
            if self._state == "CLOSED":
                return True
            if self._state == "OPEN":
                if self._opened_at and now - self._opened_at >= self.OPEN_DURATION_S:
                    self._state = "HALF-OPEN"
                    return True
                return False
            # HALF-OPEN: allow one probe
            return True

    def record_success(self) -> None:
        with self._lock:
            self._failures.clear()
            self._state = "CLOSED"
            self._opened_at = None

    def record_failure(self) -> None:
        with self._lock:
            now = time.monotonic()
            self._failures.append(now)
            # Evict failures outside the window
            while self._failures and now - self._failures[0] > self.FAILURE_WINDOW_S:
                self._failures.popleft()
            if self._state == "HALF-OPEN":
                self._state = "OPEN"
                self._opened_at = now
            elif len(self._failures) >= self.FAILURE_THRESHOLD and self._state != "OPEN":
                self._state = "OPEN"
                self._opened_at = now


_cb = _CircuitBreaker()


# ---------------------------------------------------------------------------
# Batch buffer
# ---------------------------------------------------------------------------
class _BatchBuffer:
    """Thread-safe in-memory buffer; flush when full or on timer."""

    MAX_SIZE = 100

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buf: list[dict[str, Any]] = []

    def push(self, row: dict[str, Any]) -> list[dict[str, Any]] | None:
        """Append row. Return full batch if flush needed, else None."""
        with self._lock:
            self._buf.append(row)
            if len(self._buf) >= self.MAX_SIZE:
                batch = self._buf[:]
                self._buf = []
                return batch
            return None

    def flush(self) -> list[dict[str, Any]]:
        """Return and clear current buffer."""
        with self._lock:
            batch = self._buf[:]
            self._buf = []
            return batch


_batch_buf = _BatchBuffer()
_BATCH_MODE = os.getenv("SIGNAL_EVENTS_BATCH", "false").lower() == "true"


# ---------------------------------------------------------------------------
# Supabase client
# ---------------------------------------------------------------------------
def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


# ---------------------------------------------------------------------------
# DLQ helpers
# ---------------------------------------------------------------------------
def insert_signal_event_dlq(original_data: dict[str, Any], error_msg: str, attempt_count: int = 3) -> None:
    """Write failed event to dead-letter queue."""
    try:
        sb = _sb()
        sb.table(SIGNAL_DLQ_TABLE).insert({
            "original_data": original_data,
            "error_msg": error_msg,
            "attempt_count": attempt_count,
        }).execute()
    except Exception as e:
        log.error("DLQ insert also failed: %s", e)


def fetch_dlq_pending(limit: int = 200) -> list[dict]:
    """Return DLQ rows not yet replayed."""
    sb = _sb()
    result = (
        sb.table(SIGNAL_DLQ_TABLE)
        .select("*")
        .is_("replayed_at", "null")
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )
    return result.data or []


def mark_dlq_replayed(dlq_id: str) -> None:
    """Mark a DLQ row as replayed."""
    sb = _sb()
    sb.table(SIGNAL_DLQ_TABLE).update(
        {"replayed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", dlq_id).execute()


def replay_dlq_batch(limit: int = 200, dry_run: bool = False) -> dict[str, int]:
    """Replay pending DLQ entries. Returns {replayed, skipped, errors}."""
    rows = fetch_dlq_pending(limit=limit)
    replayed = skipped = errors = 0
    for row in rows:
        data = row.get("original_data") or {}
        if dry_run:
            log.info("[DRY-RUN] would replay DLQ id=%s symbol=%s", row["id"], data.get("symbol"))
            skipped += 1
            continue
        try:
            sb = _sb()
            sb.table(SIGNAL_EVENTS_TABLE).insert(data).execute()
            mark_dlq_replayed(row["id"])
            replayed += 1
        except Exception as e:
            log.error("DLQ replay failed for id=%s: %s", row["id"], e)
            errors += 1
    return {"replayed": replayed, "skipped": skipped, "errors": errors}


# ---------------------------------------------------------------------------
# Backoff helper
# ---------------------------------------------------------------------------
def get_retry_backoff(attempt: int) -> int:
    """Return wait seconds before the next attempt. attempt=0 → first retry."""
    if attempt < len(_RETRY_BACKOFFS):
        return _RETRY_BACKOFFS[attempt]
    return _RETRY_BACKOFFS[-1]


# ---------------------------------------------------------------------------
# Core write with retry FSM
# ---------------------------------------------------------------------------
def _do_insert(row: dict[str, Any]) -> str:
    """Low-level insert (no retry). Returns signal_id."""
    sb = _sb()
    result = sb.table(SIGNAL_EVENTS_TABLE).insert(row).execute()
    data = result.data
    if not data:
        raise RuntimeError(
            f"insert_signal_event: no data returned for {row.get('symbol')}/{row.get('pattern')}"
        )
    return str(data[0]["id"])


def _flush_batch(batch: list[dict[str, Any]]) -> None:
    """Insert a batch as a single Supabase call."""
    if not batch:
        return
    if not _cb.allow():
        for row in batch:
            insert_signal_event_dlq(row, "circuit breaker OPEN")
        return
    try:
        sb = _sb()
        sb.table(SIGNAL_EVENTS_TABLE).insert(batch).execute()
        _cb.record_success()
    except Exception as e:
        _cb.record_failure()
        log.error("batch flush failed (%d rows): %s", len(batch), e)
        for row in batch:
            insert_signal_event_dlq(row, str(e))


def flush_batch_buffer() -> int:
    """Flush the in-memory batch buffer. Returns number of rows flushed."""
    batch = _batch_buf.flush()
    if batch:
        _flush_batch(batch)
    return len(batch)


def insert_signal_event(
    fired_at: datetime,
    symbol: str,
    pattern: str,
    direction: str,
    entry_price: float | None,
    component_scores: dict[str, Any],
    tp_pct: float = 0.60,
    sl_pct: float = 0.30,
) -> str:
    """Insert signal event with retry FSM + circuit breaker.

    Batch mode (SIGNAL_EVENTS_BATCH=true): buffers until 100 events or flush call.
    Returns signal_id (UUID str, or temp UUID in batch mode).
    """
    fired_at_iso = (
        fired_at.isoformat()
        if fired_at.tzinfo
        else fired_at.replace(tzinfo=timezone.utc).isoformat()
    )
    row: dict[str, Any] = {
        "fired_at": fired_at_iso,
        "symbol": symbol,
        "pattern": pattern,
        "direction": direction,
        "tp_pct": tp_pct,
        "sl_pct": sl_pct,
        "component_scores": component_scores,
        "schema_version": component_scores.get("schema_version", 1),
        "retry_count": 0,
    }
    if entry_price is not None:
        row["entry_price"] = entry_price

    if _BATCH_MODE:
        full_batch = _batch_buf.push(row)
        if full_batch:
            _flush_batch(full_batch)
        return str(uuid.uuid4())  # temp id in batch mode

    # Retry FSM
    if not _cb.allow():
        insert_signal_event_dlq(row, "circuit breaker OPEN")
        return str(uuid.uuid4())

    last_exc: Exception | None = None
    for attempt in range(len(_RETRY_BACKOFFS)):
        try:
            signal_id = _do_insert({**row, "retry_count": attempt})
            _cb.record_success()
            return signal_id
        except Exception as e:
            _cb.record_failure()
            last_exc = e
            wait = get_retry_backoff(attempt)
            log.warning(
                "insert_signal_event attempt %d failed (%s), retry in %ds", attempt, e, wait
            )
            time.sleep(wait)

    # All attempts exhausted → DLQ
    insert_signal_event_dlq(row, str(last_exc), attempt_count=len(_RETRY_BACKOFFS))
    log.error(
        "insert_signal_event sent to DLQ after %d attempts: %s/%s",
        len(_RETRY_BACKOFFS), symbol, pattern,
    )
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Outcome operations (unchanged from W-0367)
# ---------------------------------------------------------------------------
def init_outcomes(signal_id: str, fired_at: datetime) -> None:
    """Create 4 unresolved outcome rows (1h/4h/24h/72h) for a signal."""
    rows = [
        {
            "signal_id": signal_id,
            "horizon_h": h,
            "outcome_at": None,
            "realized_pnl_pct": None,
            "peak_pnl_pct": None,
            "triple_barrier_outcome": None,
            "outcome_error": None,
            "resolved_at": None,
        }
        for h in HORIZONS
    ]
    sb = _sb()
    sb.table(SIGNAL_OUTCOMES_TABLE).upsert(rows, on_conflict="signal_id,horizon_h").execute()


def fetch_unresolved(limit: int = 200) -> list[dict]:
    """Fetch unresolved outcomes with signal join."""
    sb = _sb()
    result = (
        sb.table(SIGNAL_OUTCOMES_TABLE)
        .select("*, scan_signal_events!inner(symbol, pattern, direction, entry_price, tp_pct, sl_pct, fired_at)")
        .is_("resolved_at", "null")
        .limit(limit)
        .execute()
    )
    rows = result.data or []
    merged = []
    for row in rows:
        event = row.pop("scan_signal_events", {}) or {}
        flat = {**row, **event}
        flat["signal_id"] = row["signal_id"]
        if isinstance(flat.get("fired_at"), str):
            try:
                flat["fired_at"] = datetime.fromisoformat(flat["fired_at"].replace("Z", "+00:00"))
            except Exception:
                pass
        merged.append(flat)
    return merged


def resolve_outcome(signal_id: str, horizon_h: int, outcome: dict[str, Any]) -> None:
    """Update one outcome row with resolved P&L and triple_barrier_outcome."""
    sb = _sb()
    (
        sb.table(SIGNAL_OUTCOMES_TABLE)
        .update(outcome)
        .eq("signal_id", signal_id)
        .eq("horizon_h", horizon_h)
        .execute()
    )


def fetch_signal_components(signal_id: str) -> dict | None:
    """Fetch component_scores for a single signal."""
    sb = _sb()
    result = (
        sb.table(SIGNAL_EVENTS_TABLE)
        .select("id, fired_at, symbol, pattern, direction, entry_price, component_scores, schema_version")
        .eq("id", signal_id)
        .limit(1)
        .execute()
    )
    data = result.data
    return data[0] if data else None


def fetch_resolved_outcomes(lookback_days: int, pattern_slug: str | None = None) -> list[dict]:
    """Fetch resolved outcomes within lookback window."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()
    sb = _sb()
    query = (
        sb.table(SIGNAL_OUTCOMES_TABLE)
        .select(
            "horizon_h, realized_pnl_pct, peak_pnl_pct, triple_barrier_outcome, resolved_at, "
            "scan_signal_events!inner(symbol, pattern, direction, entry_price, component_scores, fired_at)"
        )
        .not_.is_("resolved_at", "null")
        .gte("resolved_at", cutoff)
    )
    result = query.execute()
    rows = result.data or []
    merged = []
    for row in rows:
        event = row.pop("scan_signal_events", {}) or {}
        flat = {**row, **event}
        if pattern_slug and flat.get("pattern") != pattern_slug:
            continue
        merged.append(flat)
    return merged


def fetch_recent_signals(slug: str, days: int = 30, limit: int = 20) -> list[dict]:
    """Return recent signals for a pattern slug with resolved outcome (horizon_h=72).

    Each record: id, symbol, direction, entry_price, fired_at, outcome, pnl_pct.
    Unresolved outcomes appear as outcome='pending', pnl_pct=None.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    sb = _sb()
    rows = (
        sb.table(SIGNAL_EVENTS_TABLE)
        .select(
            "id, symbol, direction, entry_price, fired_at, "
            f"{SIGNAL_OUTCOMES_TABLE}(horizon_h, triple_barrier_outcome, realized_pnl_pct)"
        )
        .eq("pattern", slug)
        .gte("fired_at", cutoff)
        .order("fired_at", desc=True)
        .limit(limit)
        .execute()
        .data or []
    )
    result = []
    for row in rows:
        outcomes = row.pop(SIGNAL_OUTCOMES_TABLE, None) or []
        # pick horizon_h=72 outcome if available, else latest
        h72 = next((o for o in outcomes if o.get("horizon_h") == 72), None)
        best = h72 or (outcomes[0] if outcomes else None)
        result.append({
            "id": row.get("id"),
            "symbol": row.get("symbol"),
            "direction": row.get("direction"),
            "entry_price": row.get("entry_price"),
            "fired_at": row.get("fired_at"),
            "outcome": best.get("triple_barrier_outcome") if best else "pending",
            "pnl_pct": best.get("realized_pnl_pct") if best else None,
        })
    return result
