"""JSON-based ledger store. Simple, portable, no DB dependency.

Files stored in engine/ledger_data/{pattern_slug}/{outcome_id}.json

v2 improvements (CTO review):
- auto_evaluate_pending(): 72h window → auto-verdict from Binance prices
- BTC-conditional hit rate calculation
- Expected value computation
- Edge decay analysis (rolling 30-day windows)
"""
from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import time as _time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from capture.types import CaptureRecord
from ledger.types import (
    LedgerRecordType,
    Outcome,
    PatternLedgerFamilyStats,
    PatternLedgerRecord,
    PatternOutcome,
    PatternStats,
)
from patterns.definitions import current_definition_id
from patterns.definition_refs import definition_id_from_ref
from patterns.outcome_policy import decide_outcome, policy_for
from patterns.types import PhaseAttemptRecord

log = logging.getLogger("engine.ledger")

LEDGER_DIR = Path(__file__).parent.parent / "ledger_data"
LEDGER_RECORDS_DIR = Path(__file__).parent.parent / "ledger_records"

# In-process cache for list_all() — bounded per slug, 30s TTL, invalidated on write.
_list_all_cache: dict[str, tuple[float, list]] = {}
_LIST_ALL_TTL = 30.0
_SAFE_PATTERN_SLUG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def validate_pattern_slug(pattern_slug: str, *, allow_empty: bool = False) -> str:
    value = pattern_slug.strip()
    if not value:
        if allow_empty:
            return ""
        raise ValueError("pattern_slug is required")
    if value != pattern_slug:
        raise ValueError("pattern_slug must not include leading or trailing whitespace")
    if "/" in value or "\\" in value or ".." in value:
        raise ValueError("pattern_slug contains invalid path characters")
    if any(ch.isspace() for ch in value):
        raise ValueError("pattern_slug must not contain whitespace")
    if not _SAFE_PATTERN_SLUG_RE.fullmatch(value):
        raise ValueError("pattern_slug contains unsupported characters")
    return value


def _safe_pattern_dir(base_dir: Path, pattern_slug: str, *, allow_empty: bool = False) -> Path:
    slug = validate_pattern_slug(pattern_slug, allow_empty=allow_empty)
    base = base_dir.resolve()
    candidate = (base_dir / slug).resolve() if slug else base
    if candidate != base and candidate.parent != base:
        raise ValueError("pattern_slug escapes ledger base directory")
    candidate.mkdir(parents=True, exist_ok=True)
    return candidate


def outcome_definition_id(outcome: PatternOutcome) -> str | None:
    return outcome.definition_id or definition_id_from_ref(
        outcome.definition_ref if isinstance(outcome.definition_ref, dict) else None
    )


def filter_outcomes_by_definition(
    outcomes: list[PatternOutcome],
    definition_id: str | None,
    *,
    pattern_slug: str | None = None,
) -> list[PatternOutcome]:
    if definition_id is None:
        return outcomes
    current_id = current_definition_id(pattern_slug) if pattern_slug is not None else None
    return [
        outcome
        for outcome in outcomes
        if outcome_definition_id(outcome) == definition_id
        or (outcome_definition_id(outcome) is None and current_id == definition_id)
    ]


def list_outcomes_for_definition(
    ledger,
    pattern_slug: str,
    *,
    definition_id: str | None = None,
) -> list[PatternOutcome]:
    if definition_id is None:
        return ledger.list_all(pattern_slug)
    try:
        return ledger.list_all(pattern_slug, definition_id=definition_id)
    except TypeError:
        return filter_outcomes_by_definition(
            ledger.list_all(pattern_slug),
            definition_id,
            pattern_slug=pattern_slug,
        )


def _compute_stats_from_outcomes(pattern_slug: str, outcomes: list) -> "PatternStats":
    """Pure-Python stats computation shared by FileLedgerStore and SupabaseLedgerStore."""
    if not outcomes:
        return PatternStats(
            pattern_slug=pattern_slug,
            total_instances=0, pending_count=0,
            success_count=0, failure_count=0,
            success_rate=0.0, avg_gain_pct=None, avg_loss_pct=None,
            expected_value=None, avg_duration_hours=None,
            recent_30d_count=0, recent_30d_success_rate=None,
            btc_bullish_rate=None, btc_bearish_rate=None,
            btc_sideways_rate=None, decay_direction=None,
        )

    pending = [o for o in outcomes if o.outcome == "pending"]
    success = [o for o in outcomes if o.outcome == "success"]
    failure = [o for o in outcomes if o.outcome in ("failure", "timeout")]

    decided = len(success) + len(failure)
    success_rate = len(success) / decided if decided > 0 else 0.0

    gains = [o.max_gain_pct for o in success if o.max_gain_pct is not None]
    avg_gain = sum(gains) / len(gains) if gains else None

    losses = [o.exit_return_pct for o in failure if o.exit_return_pct is not None]
    avg_loss = sum(losses) / len(losses) if losses else None

    ev = None
    if avg_gain is not None and avg_loss is not None and decided > 0:
        failure_rate = 1.0 - success_rate
        ev = success_rate * avg_gain + failure_rate * avg_loss

    durations = [o.duration_hours for o in success if o.duration_hours is not None]
    avg_dur = sum(durations) / len(durations) if durations else None

    cutoff = datetime.now() - timedelta(days=30)
    recent = [o for o in outcomes if o.created_at and o.created_at > cutoff]
    recent_success = [o for o in recent if o.outcome == "success"]
    recent_failure = [o for o in recent if o.outcome in ("failure", "timeout")]
    recent_decided = len(recent_success) + len(recent_failure)
    recent_rate = len(recent_success) / recent_decided if recent_decided > 0 else None

    def _conditional_rate(trend: str) -> float | None:
        s = [o for o in success if o.btc_trend_at_entry == trend]
        f = [o for o in failure if o.btc_trend_at_entry == trend]
        d = len(s) + len(f)
        return len(s) / d if d >= 3 else None

    btc_bull = _conditional_rate("bullish")
    btc_bear = _conditional_rate("bearish")
    btc_side = _conditional_rate("sideways")

    decay = None
    decided_outcomes = [o for o in outcomes if o.outcome != "pending"]
    decided_outcomes.sort(key=lambda o: o.created_at or datetime.min)
    if len(decided_outcomes) >= 10:
        mid = len(decided_outcomes) // 2
        first_half = decided_outcomes[:mid]
        second_half = decided_outcomes[mid:]
        rate_first = sum(1 for o in first_half if o.outcome == "success") / len(first_half)
        rate_second = sum(1 for o in second_half if o.outcome == "success") / len(second_half)
        diff = rate_second - rate_first
        if diff > 0.05:
            decay = "improving"
        elif diff < -0.05:
            decay = "decaying"
        else:
            decay = "stable"

    return PatternStats(
        pattern_slug=pattern_slug,
        total_instances=len(outcomes),
        pending_count=len(pending),
        success_count=len(success),
        failure_count=len(failure),
        success_rate=success_rate,
        avg_gain_pct=avg_gain,
        avg_loss_pct=avg_loss,
        expected_value=ev,
        avg_duration_hours=avg_dur,
        recent_30d_count=len(recent),
        recent_30d_success_rate=recent_rate,
        btc_bullish_rate=btc_bull,
        btc_bearish_rate=btc_bear,
        btc_sideways_rate=btc_side,
        decay_direction=decay,
    )


def _build_record_family_summary(
    pattern_slug: str,
    records: list[PatternLedgerRecord],
) -> tuple[PatternLedgerFamilyStats, PatternLedgerRecord | None, PatternLedgerRecord | None]:
    counts = {
        "entry": 0,
        "capture": 0,
        "score": 0,
        "outcome": 0,
        "verdict": 0,
        "phase_attempt": 0,
        "training_run": 0,
        "model": 0,
    }
    latest_training_run_record: PatternLedgerRecord | None = None
    latest_model_record: PatternLedgerRecord | None = None

    for record in records:
        record_type = record.record_type
        if record_type in counts:
            counts[record_type] += 1
        if latest_training_run_record is None and record_type == "training_run":
            latest_training_run_record = record
        if latest_model_record is None and record_type == "model":
            latest_model_record = record

    entry_count = counts["entry"]
    capture_count = counts["capture"]
    verdict_count = counts["verdict"]
    return (
        PatternLedgerFamilyStats(
            pattern_slug=pattern_slug,
            entry_count=entry_count,
            capture_count=capture_count,
            score_count=counts["score"],
            outcome_count=counts["outcome"],
            verdict_count=verdict_count,
            phase_attempt_count=counts["phase_attempt"],
            training_run_count=counts["training_run"],
            model_count=counts["model"],
            capture_to_entry_rate=capture_count / entry_count if entry_count > 0 else None,
            verdict_to_entry_rate=verdict_count / entry_count if entry_count > 0 else None,
        ),
        latest_training_run_record,
        latest_model_record,
    )


def _normalize_record_since(
    created_at: datetime | None,
    since: datetime | None,
) -> datetime | None:
    if since is None or created_at is None:
        return since
    if created_at.tzinfo is not None and since.tzinfo is None:
        return since.replace(tzinfo=timezone.utc)
    if created_at.tzinfo is None and since.tzinfo is not None:
        return since.astimezone(timezone.utc).replace(tzinfo=None)
    return since


def _record_definition_id(record: PatternLedgerRecord) -> str | None:
    payload = record.payload if isinstance(record.payload, dict) else {}
    value = payload.get("definition_id")
    if isinstance(value, str) and value:
        return value
    return definition_id_from_ref(payload.get("definition_ref"))


def _definition_payload(
    *,
    definition_id: str | None,
    definition_ref: dict | None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "definition_ref": dict(definition_ref or {}),
    }
    resolved_definition_id = definition_id or definition_id_from_ref(definition_ref)
    if resolved_definition_id is not None:
        payload["definition_id"] = resolved_definition_id
    return payload


def _record_matches_definition(
    pattern_slug: str,
    record: PatternLedgerRecord,
    definition_id: str | None,
) -> bool:
    if definition_id is None:
        return True
    record_definition_id = _record_definition_id(record)
    if record_definition_id is not None:
        return record_definition_id == definition_id
    return current_definition_id(pattern_slug) == definition_id


class FileLedgerStore:
    """Append-only JSON ledger for PatternOutcome records."""

    def __init__(self, base_dir: Path = LEDGER_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _dir(self, pattern_slug: str) -> Path:
        return _safe_pattern_dir(self.base_dir, pattern_slug, allow_empty=False)

    def _path(self, pattern_slug: str, outcome_id: str) -> Path:
        return self._dir(pattern_slug) / f"{outcome_id}.json"

    def save(self, outcome: PatternOutcome) -> Path:
        """Create or update a PatternOutcome record."""
        outcome.updated_at = datetime.now()
        path = self._path(outcome.pattern_slug, outcome.id)
        with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as f:
            json.dump(outcome.to_dict(), f, indent=2)
            temp_path = Path(f.name)
        temp_path.replace(path)
        # Invalidate list_all cache for this slug on every write.
        _list_all_cache.pop(outcome.pattern_slug, None)
        return path

    def load(self, pattern_slug: str, outcome_id: str) -> PatternOutcome | None:
        path = self._path(pattern_slug, outcome_id)
        if not path.exists():
            return None
        with open(path) as f:
            d = json.load(f)
        _DT_FIELDS = (
            "phase2_at", "accumulation_at", "breakout_at",
            "invalidated_at", "created_at", "updated_at",
        )
        for k in _DT_FIELDS:
            if d.get(k):
                try:
                    d[k] = datetime.fromisoformat(d[k])
                except ValueError:
                    d[k] = None
        # Handle fields that may not exist in older records
        d.setdefault("feature_snapshot", None)
        d.setdefault("entry_transition_id", None)
        d.setdefault("entry_scan_id", None)
        d.setdefault("entry_block_scores", None)
        d.setdefault("pattern_version", None)
        d.setdefault("definition_id", None)
        d.setdefault("definition_ref", None)
        d.setdefault("entry_block_coverage", None)
        d.setdefault("entry_p_win", None)
        d.setdefault("entry_ml_state", None)
        d.setdefault("entry_model_key", None)
        d.setdefault("entry_model_version", None)
        d.setdefault("entry_rollout_state", None)
        d.setdefault("entry_threshold", None)
        d.setdefault("entry_threshold_passed", None)
        d.setdefault("entry_ml_error", None)
        d.setdefault("evaluation_window_hours", 72.0)
        d.setdefault("exit_price", None)
        d.setdefault("exit_return_pct", None)
        return PatternOutcome(**d)

    @staticmethod
    def _window_now(reference: datetime) -> datetime:
        """Return `now` with matching awareness to the reference timestamp."""
        return datetime.now(timezone.utc) if reference.tzinfo else datetime.now()

    @staticmethod
    def _slice_close_window(close, start: datetime, end: datetime):
        """Return close prices inside the inclusive evaluation window."""
        index = close.index
        if getattr(index, "tz", None) is not None and start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
            end = end.replace(tzinfo=timezone.utc)
        elif getattr(index, "tz", None) is None and start.tzinfo is not None:
            start = start.astimezone(timezone.utc).replace(tzinfo=None)
            end = end.astimezone(timezone.utc).replace(tzinfo=None)
        return close.loc[(index >= start) & (index <= end)]

    def list_all(
        self,
        pattern_slug: str,
        *,
        definition_id: str | None = None,
    ) -> list[PatternOutcome]:
        cached = _list_all_cache.get(pattern_slug)
        if definition_id is None and cached is not None:
            ts, data = cached
            if _time.monotonic() - ts < _LIST_ALL_TTL:
                return data
        d = self._dir(pattern_slug)
        results = []
        for p in d.glob("*.json"):
            outcome = self.load(pattern_slug, p.stem)
            if outcome:
                results.append(outcome)
        data = sorted(results, key=lambda o: o.created_at or datetime.min, reverse=True)
        if definition_id is None:
            _list_all_cache[pattern_slug] = (_time.monotonic(), data)
            return data
        return filter_outcomes_by_definition(data, definition_id, pattern_slug=pattern_slug)

    def list_pending(
        self,
        pattern_slug: str,
        *,
        definition_id: str | None = None,
    ) -> list[PatternOutcome]:
        return [
            outcome
            for outcome in self.list_all(pattern_slug, definition_id=definition_id)
            if outcome.outcome == "pending"
        ]

    def close_outcome(
        self,
        pattern_slug: str,
        outcome_id: str,
        result: Outcome,
        peak_price: float | None = None,
        exit_price: float | None = None,
        breakout_at: datetime | None = None,
        invalidated_at: datetime | None = None,
    ) -> PatternOutcome | None:
        """Mark a pending outcome as success/failure/timeout."""
        outcome = self.load(pattern_slug, outcome_id)
        if not outcome:
            log.warning(f"Outcome {outcome_id} not found")
            return None
        previous_outcome = outcome.outcome
        outcome.outcome = result

        if peak_price is not None:
            outcome.peak_price = peak_price
            if outcome.entry_price and outcome.entry_price > 0:
                outcome.max_gain_pct = (peak_price - outcome.entry_price) / outcome.entry_price

        if exit_price is not None:
            outcome.exit_price = exit_price
            if outcome.entry_price and outcome.entry_price > 0:
                outcome.exit_return_pct = (exit_price - outcome.entry_price) / outcome.entry_price

        if breakout_at:
            outcome.breakout_at = breakout_at
            if outcome.accumulation_at:
                delta = breakout_at - outcome.accumulation_at
                outcome.duration_hours = delta.total_seconds() / 3600

        if invalidated_at:
            outcome.invalidated_at = invalidated_at

        self.save(outcome)
        LEDGER_RECORD_STORE.append_outcome_record(outcome, previous_outcome=previous_outcome)
        return outcome

    # ── v2: Auto-evaluation ──────────────────────────────────────────────────

    def auto_evaluate_pending(self, pattern_slug: str) -> list[PatternOutcome]:
        """Check pending outcomes past their evaluation window and auto-verdict.

        Called by cron/scheduler. For each pending outcome:
        1. If accumulation_at + eval_window has passed → fetch current price
        2. Compare peak_return vs HIT_THRESHOLD, exit_return vs MISS_THRESHOLD
        3. Mark as HIT/MISS/EXPIRED
        """
        from data_cache.loader import load_klines

        evaluated = []

        for outcome in self.list_pending(pattern_slug):
            if not outcome.accumulation_at:
                continue
            window = timedelta(hours=outcome.evaluation_window_hours)
            now = self._window_now(outcome.accumulation_at)
            if now - outcome.accumulation_at < window:
                continue  # still within evaluation window

            # Fetch price data for verdict
            try:
                klines = load_klines(outcome.symbol, offline=True)
                if klines is None or klines.empty:
                    continue
            except Exception:
                continue

            close = klines["close"].astype(float)
            entry = outcome.entry_price
            if not entry or entry <= 0:
                # Can't evaluate without entry price — mark expired
                closed = self.close_outcome(pattern_slug, outcome.id, "timeout")
                if closed:
                    evaluated.append(closed)
                continue

            window_end = outcome.accumulation_at + window
            window_close = self._slice_close_window(close, outcome.accumulation_at, window_end)
            if window_close.empty:
                log.debug(
                    "Skip auto-eval for %s/%s: no close data inside %s -> %s",
                    outcome.symbol,
                    outcome.id,
                    outcome.accumulation_at,
                    window_end,
                )
                continue

            # Delegate to outcome_policy.decide_outcome — single source of truth
            # for HIT/MISS/TIMEOUT thresholds.
            forward_closes = list(window_close.astype(float))
            decision = decide_outcome(
                entry_price=entry,
                forward_closes=forward_closes,
                policy=policy_for(pattern_slug),
            )
            if decision is None:
                continue

            closed = self.close_outcome(
                pattern_slug, outcome.id, decision.outcome,
                peak_price=decision.peak_price, exit_price=decision.exit_price,
            )
            log.info(
                "AUTO-VERDICT: %s/%s → %s (peak=%.1f%%, exit=%.1f%%)",
                outcome.symbol, outcome.id, decision.outcome,
                decision.max_gain_pct * 100, decision.exit_return_pct * 100,
            )
            if closed:
                evaluated.append(closed)

        return evaluated

    # ── Stats ────────────────────────────────────────────────────────────────

    def compute_stats(
        self,
        pattern_slug: str,
        *,
        definition_id: str | None = None,
    ) -> PatternStats:
        """Compute aggregate stats for a pattern.

        v2: includes expected value, BTC-conditional rates, decay analysis.
        """
        outcomes = self.list_all(pattern_slug, definition_id=definition_id)
        return _compute_stats_from_outcomes(pattern_slug, outcomes)


class LedgerRecordStore:
    """Append-only JSON record family for the pattern engine core loop."""

    def __init__(self, base_dir: Path = LEDGER_RECORDS_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _dir(self, pattern_slug: str) -> Path:
        return _safe_pattern_dir(self.base_dir, pattern_slug, allow_empty=True)

    def _path(self, pattern_slug: str, record_id: str) -> Path:
        return self._dir(pattern_slug) / f"{record_id}.json"

    def append(self, record: PatternLedgerRecord) -> Path:
        path = self._path(record.pattern_slug, record.id)
        with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as f:
            json.dump(record.to_dict(), f, indent=2)
            temp_path = Path(f.name)
        temp_path.replace(path)
        return path

    def load(self, pattern_slug: str, record_id: str) -> PatternLedgerRecord | None:
        path = self._path(pattern_slug, record_id)
        if not path.exists():
            return None
        with open(path) as f:
            d = json.load(f)
        created_at = d.get("created_at")
        if created_at:
            try:
                d["created_at"] = datetime.fromisoformat(created_at)
            except ValueError:
                d["created_at"] = datetime.now()
        return PatternLedgerRecord(**d)

    def list(
        self,
        pattern_slug: str,
        *,
        record_type: LedgerRecordType | None = None,
        symbol: str | None = None,
        outcome_id: str | None = None,
        definition_id: str | None = None,
        limit: int | None = None,
    ) -> list[PatternLedgerRecord]:
        records: list[PatternLedgerRecord] = []
        for path in self._dir(pattern_slug).glob("*.json"):
            record = self.load(pattern_slug, path.stem)
            if record is None:
                continue
            if record_type and record.record_type != record_type:
                continue
            if symbol and record.symbol != symbol:
                continue
            if outcome_id and record.outcome_id != outcome_id:
                continue
            if not _record_matches_definition(pattern_slug, record, definition_id):
                continue
            records.append(record)
        records.sort(key=lambda record: record.created_at, reverse=True)
        return records[:limit] if limit is not None else records

    def list_pattern_slugs(self) -> list[str]:
        if not self.base_dir.exists():
            return []
        return sorted(path.name for path in self.base_dir.iterdir() if path.is_dir())

    def summarize_family(
        self,
        pattern_slug: str,
        *,
        definition_id: str | None = None,
    ) -> tuple[PatternLedgerFamilyStats, PatternLedgerRecord | None, PatternLedgerRecord | None]:
        records = self.list(pattern_slug, definition_id=definition_id)
        return _build_record_family_summary(pattern_slug, records)

    def compute_family_stats(self, pattern_slug: str) -> PatternLedgerFamilyStats:
        stats, _, _ = self.summarize_family(pattern_slug)
        return stats

    def count_records(
        self,
        *,
        record_type: LedgerRecordType,
        since: datetime | None = None,
        pattern_slug: str | None = None,
    ) -> int:
        if pattern_slug is not None:
            slug_dirs = [self._dir(pattern_slug)]
        elif not self.base_dir.exists():
            return 0
        else:
            slug_dirs = [path for path in self.base_dir.iterdir() if path.is_dir()]

        count = 0
        for slug_dir in slug_dirs:
            for path in slug_dir.glob("*.json"):
                record = self.load(slug_dir.name, path.stem)
                if record is None or record.record_type != record_type:
                    continue
                normalized_since = _normalize_record_since(record.created_at, since)
                if normalized_since is not None and record.created_at and record.created_at < normalized_since:
                    continue
                count += 1
        return count

    def append_entry_record(self, outcome: PatternOutcome) -> Path:
        return self.append(
            PatternLedgerRecord(
                record_type="entry",
                pattern_slug=outcome.pattern_slug,
                symbol=outcome.symbol,
                user_id=outcome.user_id,
                outcome_id=outcome.id,
                transition_id=outcome.entry_transition_id,
                scan_id=outcome.entry_scan_id,
                payload={
                    **_definition_payload(
                        definition_id=outcome.definition_id,
                        definition_ref=outcome.definition_ref if isinstance(outcome.definition_ref, dict) else None,
                    ),
                    "accumulation_at": outcome.accumulation_at.isoformat() if outcome.accumulation_at else None,
                    "entry_price": outcome.entry_price,
                    "btc_trend_at_entry": outcome.btc_trend_at_entry,
                    "entry_block_coverage": outcome.entry_block_coverage,
                },
            )
        )

    def append_score_record(self, outcome: PatternOutcome) -> Path:
        return self.append(
            PatternLedgerRecord(
                record_type="score",
                pattern_slug=outcome.pattern_slug,
                symbol=outcome.symbol,
                user_id=outcome.user_id,
                outcome_id=outcome.id,
                transition_id=outcome.entry_transition_id,
                scan_id=outcome.entry_scan_id,
                payload={
                    **_definition_payload(
                        definition_id=outcome.definition_id,
                        definition_ref=outcome.definition_ref if isinstance(outcome.definition_ref, dict) else None,
                    ),
                    "entry_p_win": outcome.entry_p_win,
                    "entry_ml_state": outcome.entry_ml_state,
                    "entry_model_key": outcome.entry_model_key,
                    "entry_model_version": outcome.entry_model_version,
                    "entry_rollout_state": outcome.entry_rollout_state,
                    "entry_threshold": outcome.entry_threshold,
                    "entry_threshold_passed": outcome.entry_threshold_passed,
                    "entry_ml_error": outcome.entry_ml_error,
                },
            )
        )

    def append_capture_record(self, capture: CaptureRecord) -> Path:
        return self.append(
            PatternLedgerRecord(
                record_type="capture",
                pattern_slug=capture.pattern_slug,
                symbol=capture.symbol,
                user_id=capture.user_id,
                capture_id=capture.capture_id,
                transition_id=capture.candidate_transition_id,
                scan_id=capture.scan_id,
                payload={
                    **_definition_payload(
                        definition_id=capture.definition_id,
                        definition_ref=capture.definition_ref if isinstance(capture.definition_ref, dict) else None,
                    ),
                    "capture_kind": capture.capture_kind,
                    "pattern_version": capture.pattern_version,
                    "phase": capture.phase,
                    "timeframe": capture.timeframe,
                    "status": capture.status,
                    "user_note": capture.user_note,
                    "outcome_id": capture.outcome_id,
                    "verdict_id": capture.verdict_id,
                },
            )
        )

    def append_outcome_record(self, outcome: PatternOutcome, previous_outcome: Outcome | None = None) -> Path:
        return self.append(
            PatternLedgerRecord(
                record_type="outcome",
                pattern_slug=outcome.pattern_slug,
                symbol=outcome.symbol,
                user_id=outcome.user_id,
                outcome_id=outcome.id,
                transition_id=outcome.entry_transition_id,
                scan_id=outcome.entry_scan_id,
                payload={
                    **_definition_payload(
                        definition_id=outcome.definition_id,
                        definition_ref=outcome.definition_ref if isinstance(outcome.definition_ref, dict) else None,
                    ),
                    "previous_outcome": previous_outcome,
                    "outcome": outcome.outcome,
                    "breakout_at": outcome.breakout_at.isoformat() if outcome.breakout_at else None,
                    "invalidated_at": outcome.invalidated_at.isoformat() if outcome.invalidated_at else None,
                    "peak_price": outcome.peak_price,
                    "exit_price": outcome.exit_price,
                    "max_gain_pct": outcome.max_gain_pct,
                    "exit_return_pct": outcome.exit_return_pct,
                    "duration_hours": outcome.duration_hours,
                },
            )
        )

    def append_verdict_record(self, outcome: PatternOutcome) -> Path:
        return self.append(
            PatternLedgerRecord(
                record_type="verdict",
                pattern_slug=outcome.pattern_slug,
                symbol=outcome.symbol,
                user_id=outcome.user_id,
                outcome_id=outcome.id,
                transition_id=outcome.entry_transition_id,
                scan_id=outcome.entry_scan_id,
                payload={
                    **_definition_payload(
                        definition_id=outcome.definition_id,
                        definition_ref=outcome.definition_ref if isinstance(outcome.definition_ref, dict) else None,
                    ),
                    "user_verdict": outcome.user_verdict,
                    "user_note": outcome.user_note,
                },
            )
        )

    def append_phase_attempt_record(self, attempt: PhaseAttemptRecord) -> Path:
        return self.append(
            PatternLedgerRecord(
                record_type="phase_attempt",
                pattern_slug=attempt.pattern_slug,
                symbol=attempt.symbol,
                transition_id=attempt.anchor_transition_id,
                scan_id=attempt.scan_id,
                payload={
                    "timeframe": attempt.timeframe,
                    "from_phase": attempt.from_phase,
                    "attempted_phase": attempt.attempted_phase,
                    "attempted_at": attempt.attempted_at.isoformat() if attempt.attempted_at else None,
                    "phase_score": attempt.phase_score,
                    "missing_blocks": attempt.missing_blocks,
                    "failed_reason": attempt.failed_reason,
                    "anchor_transition_id": attempt.anchor_transition_id,
                    "blocks_triggered": attempt.blocks_triggered,
                    "feature_snapshot": attempt.feature_snapshot,
                },
            )
        )

    def append_model_record(
        self,
        *,
        pattern_slug: str,
        model_version: str,
        user_id: str | None = None,
        definition_ref: dict | None = None,
        payload: dict | None = None,
    ) -> Path:
        return self.append(
            PatternLedgerRecord(
                record_type="model",
                pattern_slug=pattern_slug,
                user_id=user_id,
                payload={
                    "model_version": model_version,
                    **_definition_payload(
                        definition_id=None,
                        definition_ref=definition_ref,
                    ),
                    **(payload or {}),
                },
            )
        )

    def append_training_run_record(
        self,
        *,
        pattern_slug: str,
        model_key: str,
        user_id: str | None = None,
        definition_ref: dict | None = None,
        payload: dict | None = None,
    ) -> Path:
        return self.append(
            PatternLedgerRecord(
                record_type="training_run",
                pattern_slug=pattern_slug,
                user_id=user_id,
                payload={
                    "model_key": model_key,
                    **_definition_payload(
                        definition_id=None,
                        definition_ref=definition_ref,
                    ),
                    **(payload or {}),
                },
            )
        )


# Backwards-compat alias — existing imports like `from ledger.store import LedgerStore` still work.
LedgerStore = FileLedgerStore


def _is_production() -> bool:
    """True when running inside Cloud Run or with an explicit production role.

    Cloud Run sets K_SERVICE automatically on every deployed revision.
    W-0126 deploy convention: ENGINE_RUNTIME_ROLE=api or ENGINE_RUNTIME_ROLE=worker.
    """
    return bool(
        os.environ.get("K_SERVICE")
        or os.environ.get("ENGINE_RUNTIME_ROLE") in ("api", "worker")
    )


def get_ledger_store():
    """Return SupabaseLedgerStore if env configured, else FileLedgerStore (local dev).

    Set FORCE_FILE_LEDGER=true to always use FileLedgerStore (useful for local dev
    when Supabase credentials are present but network is slow/unavailable).

    W-0215: Raises RuntimeError in production when Supabase env is missing so that
    silent JSON-only writes (which survive only the container lifetime) are caught at
    startup rather than silently losing judgment ledger data.
    """
    if os.environ.get("FORCE_FILE_LEDGER", "").strip().lower() in {"1", "true", "yes", "on"}:
        return FileLedgerStore()
    has_supabase = bool(
        os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )
    if has_supabase:
        from ledger.supabase_store import SupabaseLedgerStore
        return SupabaseLedgerStore()
    if _is_production():
        raise RuntimeError(
            "Production environment detected (K_SERVICE or ENGINE_RUNTIME_ROLE set) "
            "but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing. "
            "Judgment ledger data would be lost on container restart. "
            "Set the Supabase env vars in Cloud Run."
        )
    return FileLedgerStore()


def get_ledger_record_store():
    """Return SupabaseLedgerRecordStore if env configured, else LedgerRecordStore (local dev).

    W-0126: Supabase-backed store enables O(1) compute_family_stats() via indexed DB query
    instead of O(N files) scan. Multi-instance GCP deployments share state via Postgres.

    W-0215: Raises RuntimeError in production when Supabase env is missing (same policy
    as get_ledger_store).
    """
    has_supabase = bool(
        os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    )
    if has_supabase:
        from ledger.supabase_record_store import SupabaseLedgerRecordStore
        return SupabaseLedgerRecordStore()
    if _is_production():
        raise RuntimeError(
            "Production environment detected (K_SERVICE or ENGINE_RUNTIME_ROLE set) "
            "but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing. "
            "Ledger record data would be lost on container restart. "
            "Set the Supabase env vars in Cloud Run."
        )
    return LedgerRecordStore()


LEDGER_RECORD_STORE = get_ledger_record_store()
