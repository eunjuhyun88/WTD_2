"""Supabase-backed LedgerStore — drop-in replacement for FileLedgerStore.

Persists PatternOutcome records to the `pattern_outcomes` table in Supabase
so that ML training data survives Cloud Run restarts / redeploys.

Used automatically when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set
(production). Falls back to FileLedgerStore in local dev.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Literal

from ledger.types import Outcome, PatternOutcome, PatternStats
from patterns.definitions import current_definition_id
from patterns.outcome_policy import decide_outcome, policy_for

log = logging.getLogger("engine.ledger.supabase")

_DT_FIELDS = (
    "phase2_at", "accumulation_at", "breakout_at",
    "invalidated_at", "created_at", "updated_at",
)


def _sb():
    """Create a fresh Supabase client from env."""
    from supabase import create_client  # type: ignore
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def _row_to_outcome(row: dict) -> PatternOutcome:
    """Convert a Supabase row dict to a PatternOutcome dataclass instance."""
    d = dict(row)
    for k in _DT_FIELDS:
        v = d.get(k)
        if v:
            try:
                d[k] = datetime.fromisoformat(v)
            except (ValueError, TypeError):
                d[k] = None
        else:
            d[k] = None

    # Defaults for optional fields not present in older rows
    d.setdefault("feature_snapshot", None)
    d.setdefault("entry_transition_id", None)
    d.setdefault("entry_scan_id", None)
    d.setdefault("entry_block_scores", None)
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
    d.setdefault("user_verdict", None)
    d.setdefault("user_note", None)
    d.setdefault("btc_trend_at_entry", "unknown")

    return PatternOutcome(**d)


def _outcome_to_row(outcome: PatternOutcome) -> dict:
    """Serialize PatternOutcome to a Supabase-compatible row dict."""
    d = outcome.to_dict()
    # to_dict() already converts datetimes to ISO strings — no extra work needed.
    return d


class SupabaseLedgerStore:
    """Supabase-backed ledger store — same public interface as FileLedgerStore."""

    # ── Core CRUD ────────────────────────────────────────────────────────────

    def save(self, outcome: PatternOutcome) -> None:
        """Upsert a PatternOutcome record to Supabase."""
        outcome.updated_at = datetime.now()
        row = _outcome_to_row(outcome)
        _sb().table("pattern_outcomes").upsert(row).execute()

    def load(self, pattern_slug: str, outcome_id: str) -> PatternOutcome | None:
        """Fetch a single outcome by id + pattern_slug."""
        result = (
            _sb()
            .table("pattern_outcomes")
            .select("*")
            .eq("id", outcome_id)
            .eq("pattern_slug", pattern_slug)
            .maybe_single()
            .execute()
        )
        if result.data is None:
            return None
        return _row_to_outcome(result.data)

    def list_all(self, pattern_slug: str, *, definition_id: str | None = None) -> list[PatternOutcome]:
        """Return all outcomes for a slug, ordered by created_at desc."""
        query = (
            _sb()
            .table("pattern_outcomes")
            .select("*")
            .eq("pattern_slug", pattern_slug)
            .order("created_at", desc=True)
        )
        result = query.execute()
        rows = result.data or []
        outcomes = [_row_to_outcome(r) for r in rows]
        if definition_id is None:
            return outcomes
        current_id = current_definition_id(pattern_slug)
        return [
            outcome
            for outcome in outcomes
            if outcome.definition_id == definition_id
            or (
                outcome.definition_id is None
                and not outcome.definition_ref
                and current_id == definition_id
            )
        ]

    def list_pending(self, pattern_slug: str, *, definition_id: str | None = None) -> list[PatternOutcome]:
        """Return only pending outcomes for a slug."""
        query = (
            _sb()
            .table("pattern_outcomes")
            .select("*")
            .eq("pattern_slug", pattern_slug)
            .eq("outcome", "pending")
            .order("created_at", desc=True)
        )
        result = query.execute()
        rows = result.data or []
        outcomes = [_row_to_outcome(r) for r in rows]
        if definition_id is None:
            return outcomes
        current_id = current_definition_id(pattern_slug)
        return [
            outcome
            for outcome in outcomes
            if outcome.definition_id == definition_id
            or (
                outcome.definition_id is None
                and not outcome.definition_ref
                and current_id == definition_id
            )
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
        """Mark a pending outcome as success/failure/timeout and persist."""
        outcome = self.load(pattern_slug, outcome_id)
        if not outcome:
            log.warning(f"Outcome {outcome_id} not found in Supabase")
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

        # Append ledger record (same as FileLedgerStore.close_outcome does)
        from ledger.store import LEDGER_RECORD_STORE
        LEDGER_RECORD_STORE.append_outcome_record(outcome, previous_outcome=previous_outcome)

        return outcome

    # ── Stats ────────────────────────────────────────────────────────────────

    def compute_stats(self, pattern_slug: str, *, definition_id: str | None = None) -> PatternStats:
        """Compute aggregate stats — delegates to the same pure-Python logic."""
        from ledger.store import _compute_stats_from_outcomes
        outcomes = self.list_all(pattern_slug, definition_id=definition_id)
        return _compute_stats_from_outcomes(pattern_slug, outcomes)

    def batch_list_all(self) -> dict[str, list["PatternOutcome"]]:
        """Fetch all outcomes for all slugs in a single DB roundtrip.

        Returns dict[pattern_slug → list[PatternOutcome]].
        Used by get_all_stats_sync and _build_refinement_snapshot to reduce
        N per-slug queries to 1 bulk query.
        """
        result = _sb().table("pattern_outcomes").select("*").execute()
        by_slug: dict[str, list[PatternOutcome]] = {}
        for row in (result.data or []):
            o = _row_to_outcome(row)
            by_slug.setdefault(o.pattern_slug, []).append(o)
        return by_slug

    # ── Auto-evaluation (identical to FileLedgerStore — Binance I/O, not storage) ──

    @staticmethod
    def _window_now(reference: datetime) -> datetime:
        return datetime.now(timezone.utc) if reference.tzinfo else datetime.now()

    @staticmethod
    def _slice_close_window(close, start: datetime, end: datetime):
        index = close.index
        if getattr(index, "tz", None) is not None and start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
            end = end.replace(tzinfo=timezone.utc)
        elif getattr(index, "tz", None) is None and start.tzinfo is not None:
            start = start.astimezone(timezone.utc).replace(tzinfo=None)
            end = end.astimezone(timezone.utc).replace(tzinfo=None)
        return close.loc[(index >= start) & (index <= end)]

    def auto_evaluate_pending(self, pattern_slug: str) -> list[PatternOutcome]:
        """Check pending outcomes past their evaluation window and auto-verdict."""
        from data_cache.loader import load_klines

        evaluated = []

        for outcome in self.list_pending(pattern_slug):
            if not outcome.accumulation_at:
                continue
            window = timedelta(hours=outcome.evaluation_window_hours)
            now = self._window_now(outcome.accumulation_at)
            if now - outcome.accumulation_at < window:
                continue

            try:
                klines = load_klines(outcome.symbol, offline=True)
                if klines is None or klines.empty:
                    continue
            except Exception:
                continue

            close = klines["close"].astype(float)
            entry = outcome.entry_price
            if not entry or entry <= 0:
                closed = self.close_outcome(pattern_slug, outcome.id, "timeout")
                if closed:
                    evaluated.append(closed)
                continue

            window_end = outcome.accumulation_at + window
            window_close = self._slice_close_window(close, outcome.accumulation_at, window_end)
            if window_close.empty:
                log.debug(
                    "Skip auto-eval for %s/%s: no close data inside %s -> %s",
                    outcome.symbol, outcome.id, outcome.accumulation_at, window_end,
                )
                continue

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
                "AUTO-VERDICT: %s/%s -> %s (peak=%.1f%%, exit=%.1f%%)",
                outcome.symbol, outcome.id, decision.outcome,
                decision.max_gain_pct * 100, decision.exit_return_pct * 100,
            )
            if closed:
                evaluated.append(closed)

        return evaluated
