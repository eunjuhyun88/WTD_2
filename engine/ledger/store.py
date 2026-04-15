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
import tempfile
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

log = logging.getLogger("engine.ledger")

LEDGER_DIR = Path(__file__).parent.parent / "ledger_data"
LEDGER_RECORDS_DIR = Path(__file__).parent.parent / "ledger_records"

# Verdict thresholds (from design doc §6.2)
HIT_THRESHOLD_PCT = 0.15   # peak_return >= +15% = HIT
MISS_THRESHOLD_PCT = -0.10  # exit_return <= -10% = MISS


class LedgerStore:
    """Append-only JSON ledger for PatternOutcome records."""

    def __init__(self, base_dir: Path = LEDGER_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _dir(self, pattern_slug: str) -> Path:
        d = self.base_dir / pattern_slug
        d.mkdir(parents=True, exist_ok=True)
        return d

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
        d.setdefault("entry_block_coverage", None)
        d.setdefault("entry_p_win", None)
        d.setdefault("entry_ml_state", None)
        d.setdefault("entry_model_version", None)
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

    def list_all(self, pattern_slug: str) -> list[PatternOutcome]:
        d = self._dir(pattern_slug)
        results = []
        for p in d.glob("*.json"):
            outcome = self.load(pattern_slug, p.stem)
            if outcome:
                results.append(outcome)
        return sorted(results, key=lambda o: o.created_at or datetime.min, reverse=True)

    def list_pending(self, pattern_slug: str) -> list[PatternOutcome]:
        return [o for o in self.list_all(pattern_slug) if o.outcome == "pending"]

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

            # Evaluate only with data inside the post-entry evaluation window.
            current_price = float(window_close.iloc[-1])
            peak = max(float(entry), float(window_close.max()))

            peak_return = (peak - entry) / entry
            exit_return = (current_price - entry) / entry

            if peak_return >= HIT_THRESHOLD_PCT:
                verdict: Outcome = "success"
            elif exit_return <= MISS_THRESHOLD_PCT:
                verdict = "failure"
            else:
                verdict = "timeout"  # EXPIRED — neither threshold reached

            closed = self.close_outcome(
                pattern_slug, outcome.id, verdict,
                peak_price=peak, exit_price=current_price,
            )
            log.info(
                "AUTO-VERDICT: %s/%s → %s (peak=%.1f%%, exit=%.1f%%)",
                outcome.symbol, outcome.id, verdict,
                peak_return * 100, exit_return * 100,
            )
            if closed:
                evaluated.append(closed)

        return evaluated

    # ── Stats ────────────────────────────────────────────────────────────────

    def compute_stats(self, pattern_slug: str) -> PatternStats:
        """Compute aggregate stats for a pattern.

        v2: includes expected value, BTC-conditional rates, decay analysis.
        """
        outcomes = self.list_all(pattern_slug)
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

        # v2: Expected value
        ev = None
        if avg_gain is not None and avg_loss is not None and decided > 0:
            failure_rate = 1.0 - success_rate
            ev = success_rate * avg_gain + failure_rate * avg_loss

        durations = [o.duration_hours for o in success if o.duration_hours is not None]
        avg_dur = sum(durations) / len(durations) if durations else None

        # Recent 30d
        cutoff = datetime.now() - timedelta(days=30)
        recent = [o for o in outcomes if o.created_at and o.created_at > cutoff]
        recent_success = [o for o in recent if o.outcome == "success"]
        recent_failure = [o for o in recent if o.outcome in ("failure", "timeout")]
        recent_decided = len(recent_success) + len(recent_failure)
        recent_rate = len(recent_success) / recent_decided if recent_decided > 0 else None

        # v2: BTC-conditional hit rates
        def _conditional_rate(trend: str) -> float | None:
            s = [o for o in success if o.btc_trend_at_entry == trend]
            f = [o for o in failure if o.btc_trend_at_entry == trend]
            d = len(s) + len(f)
            return len(s) / d if d >= 3 else None  # min 3 samples

        btc_bull = _conditional_rate("bullish")
        btc_bear = _conditional_rate("bearish")
        btc_side = _conditional_rate("sideways")

        # v2: Decay analysis — compare first half vs second half of decided outcomes
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


class LedgerRecordStore:
    """Append-only JSON record family for the pattern engine core loop."""

    def __init__(self, base_dir: Path = LEDGER_RECORDS_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _dir(self, pattern_slug: str) -> Path:
        d = self.base_dir / pattern_slug
        d.mkdir(parents=True, exist_ok=True)
        return d

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
            records.append(record)
        records.sort(key=lambda record: record.created_at, reverse=True)
        return records[:limit] if limit is not None else records

    def compute_family_stats(self, pattern_slug: str) -> PatternLedgerFamilyStats:
        records = self.list(pattern_slug)

        def _count(kind: LedgerRecordType) -> int:
            return sum(1 for record in records if record.record_type == kind)

        entry_count = _count("entry")
        capture_count = _count("capture")
        score_count = _count("score")
        outcome_count = _count("outcome")
        verdict_count = _count("verdict")
        model_count = _count("model")
        capture_rate = capture_count / entry_count if entry_count > 0 else None
        verdict_rate = verdict_count / entry_count if entry_count > 0 else None
        return PatternLedgerFamilyStats(
            pattern_slug=pattern_slug,
            entry_count=entry_count,
            capture_count=capture_count,
            score_count=score_count,
            outcome_count=outcome_count,
            verdict_count=verdict_count,
            model_count=model_count,
            capture_to_entry_rate=capture_rate,
            verdict_to_entry_rate=verdict_rate,
        )

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
                    "entry_p_win": outcome.entry_p_win,
                    "entry_ml_state": outcome.entry_ml_state,
                    "entry_model_version": outcome.entry_model_version,
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
                    "user_verdict": outcome.user_verdict,
                    "user_note": outcome.user_note,
                },
            )
        )

    def append_model_record(
        self,
        *,
        pattern_slug: str,
        model_version: str,
        user_id: str | None = None,
        payload: dict | None = None,
    ) -> Path:
        return self.append(
            PatternLedgerRecord(
                record_type="model",
                pattern_slug=pattern_slug,
                user_id=user_id,
                payload={
                    "model_version": model_version,
                    **(payload or {}),
                },
            )
        )


LEDGER_RECORD_STORE = LedgerRecordStore()
