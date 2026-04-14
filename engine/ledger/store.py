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

from ledger.types import PatternOutcome, PatternStats, Outcome

log = logging.getLogger("engine.ledger")

LEDGER_DIR = Path(__file__).parent.parent / "ledger_data"

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
