"""Supabase-backed LedgerRecordStore — drop-in replacement for file-based LedgerRecordStore.

Persists PatternLedgerRecord events to the `pattern_ledger_records` table so that:
- compute_family_stats() becomes a single SQL query instead of O(N files)
- multi-instance GCP deployments share state via Postgres instead of per-instance file caches

Used automatically when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
Falls back to file-based LedgerRecordStore in local dev.

W-0126 — LedgerStore Supabase migration.
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime
from typing import TYPE_CHECKING

from ledger.store import _build_record_family_summary
from ledger.types import (
    LedgerRecordType,
    PatternLedgerFamilyStats,
    PatternLedgerRecord,
)
from patterns.definitions import current_definition_id
from patterns.definition_refs import definition_id_from_ref

if TYPE_CHECKING:
    from capture.types import CaptureRecord
    from ledger.types import PatternOutcome
    from patterns.types import PhaseAttemptRecord

log = logging.getLogger("engine.ledger.supabase_records")

# Module-level singleton — one TLS handshake per process, not per call.
_client = None
_client_lock = threading.Lock()


def _sb():
    """Return the shared Supabase client, initialising it once per process.

    Double-checked locking: the outer check avoids acquiring the lock on every
    call once the client is initialised (hot path); the inner check prevents a
    race where two threads both see _client is None simultaneously.
    """
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                from supabase import create_client  # type: ignore
                url = os.environ.get("SUPABASE_URL", "")
                key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
                if not url or not key:
                    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
                _client = create_client(url, key)
    return _client


def _row_to_record(row: dict) -> PatternLedgerRecord:
    d = dict(row)
    v = d.get("created_at")
    if v:
        try:
            d["created_at"] = datetime.fromisoformat(v)
        except (ValueError, TypeError):
            d["created_at"] = datetime.now()
    else:
        d["created_at"] = datetime.now()
    d.setdefault("symbol", None)
    d.setdefault("user_id", None)
    d.setdefault("outcome_id", None)
    d.setdefault("capture_id", None)
    d.setdefault("transition_id", None)
    d.setdefault("scan_id", None)
    d.setdefault("payload", {})
    return PatternLedgerRecord(**d)


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


class SupabaseLedgerRecordStore:
    """Supabase-backed record store — same public interface as LedgerRecordStore.

    Hot-path improvement:
      compute_family_stats() = single indexed DB query (O(1)) vs file scan (O(N)).
      list(..., limit=1) for latest training_run/model = indexed single-row fetch.
    """

    # ── Core CRUD ────────────────────────────────────────────────────────────

    def append(self, record: PatternLedgerRecord) -> None:
        """Upsert to Supabase (primary) + local JSON backup (best-effort)."""
        row = record.to_dict()
        _sb().table("pattern_ledger_records").upsert(row).execute()
        try:
            from ledger.store import LedgerRecordStore
            LedgerRecordStore().append(record)
        except Exception:
            pass  # JSON backup is best-effort; Supabase is authoritative

    def load(self, pattern_slug: str, record_id: str) -> PatternLedgerRecord | None:
        result = (
            _sb()
            .table("pattern_ledger_records")
            .select("*")
            .eq("id", record_id)
            .eq("pattern_slug", pattern_slug)
            .maybe_single()
            .execute()
        )
        if result.data is None:
            return None
        return _row_to_record(result.data)

    def list(
        self,
        pattern_slug: str,
        *,
        record_type: "LedgerRecordType | None" = None,
        symbol: str | None = None,
        outcome_id: str | None = None,
        definition_id: str | None = None,
        limit: int | None = None,
    ) -> list[PatternLedgerRecord]:
        q = (
            _sb()
            .table("pattern_ledger_records")
            .select("*")
            .eq("pattern_slug", pattern_slug)
            .order("created_at", desc=True)
        )
        if record_type:
            q = q.eq("record_type", record_type)
        if symbol:
            q = q.eq("symbol", symbol)
        if outcome_id:
            q = q.eq("outcome_id", outcome_id)
        if limit is not None and definition_id is None:
            q = q.limit(limit)
        result = q.execute()
        records = [_row_to_record(r) for r in (result.data or [])]
        if definition_id:
            current_id = current_definition_id(pattern_slug)
            records = [
                record
                for record in records
                if _record_definition_id(record) == definition_id
                or (_record_definition_id(record) is None and current_id == definition_id)
            ]
        return records[:limit] if limit is not None else records

    def list_pattern_slugs(self) -> list[str]:
        result = (
            _sb()
            .table("pattern_ledger_records")
            .select("pattern_slug")
            .execute()
        )
        slugs = {
            row.get("pattern_slug")
            for row in (result.data or [])
            if row.get("pattern_slug")
        }
        return sorted(slugs)

    # ── Stats — O(1) query instead of O(N file scans) ───────────────────────

    def summarize_family(
        self,
        pattern_slug: str,
        *,
        definition_id: str | None = None,
    ) -> tuple[PatternLedgerFamilyStats, PatternLedgerRecord | None, PatternLedgerRecord | None]:
        stats = self.compute_family_stats(pattern_slug, definition_id=definition_id)
        latest_training_run = next(
            iter(self.list(pattern_slug, record_type="training_run", definition_id=definition_id, limit=1)),
            None,
        )
        latest_model = next(
            iter(self.list(pattern_slug, record_type="model", definition_id=definition_id, limit=1)),
            None,
        )
        return stats, latest_training_run, latest_model

    def compute_family_stats(
        self,
        pattern_slug: str,
        *,
        definition_id: str | None = None,
    ) -> PatternLedgerFamilyStats:
        """Aggregate family counts via a single indexed query (O(1) vs O(N files)."""
        if definition_id is None:
            result = (
                _sb()
                .table("pattern_ledger_records")
                .select("record_type")
                .eq("pattern_slug", pattern_slug)
                .execute()
            )
            rows = result.data or []
        else:
            rows = [
                {"record_type": record.record_type}
                for record in self.list(pattern_slug, definition_id=definition_id)
            ]
        stats, _, _ = _build_record_family_summary(
            pattern_slug,
            [
                PatternLedgerRecord(
                    record_type=row.get("record_type", "entry"),
                    pattern_slug=pattern_slug,
                )
                for row in rows
            ],
        )
        return stats

    def count_records(
        self,
        *,
        record_type: LedgerRecordType,
        since: datetime | None = None,
        pattern_slug: str | None = None,
    ) -> int:
        query = _sb().table("pattern_ledger_records").select("id", count="exact", head=True)
        if pattern_slug:
            query = query.eq("pattern_slug", pattern_slug)
        query = query.eq("record_type", record_type)
        if since is not None:
            query = query.gte("created_at", since.isoformat())
        result = query.execute()
        return int(result.count or 0)

    # ── append_* helpers — mirror LedgerRecordStore interface ───────────────

    def append_entry_record(self, outcome: "PatternOutcome") -> None:
        self.append(PatternLedgerRecord(
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
        ))
        # F-30 Phase 2: dual-write to ledger_entries
        try:
            _sb().table("ledger_entries").upsert({
                "id": outcome.id + ":entry",
                "capture_id": outcome.capture_id or outcome.id,
                "pattern_slug": outcome.pattern_slug,
                "entry_price": outcome.entry_price,
                "btc_trend": outcome.btc_trend_at_entry,
            }).execute()
        except Exception as exc:
            log.warning("ledger_entries dual-write failed (non-fatal): %s", exc)

    def append_score_record(self, outcome: "PatternOutcome") -> None:
        self.append(PatternLedgerRecord(
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
        ))
        # F-30 Phase 2: dual-write to ledger_scores
        try:
            _sb().table("ledger_scores").upsert({
                "id": outcome.id + ":score",
                "capture_id": outcome.capture_id or outcome.id,
                "pattern_slug": outcome.pattern_slug,
                "p_win": outcome.entry_p_win,
                "model_key": outcome.entry_model_key,
                "threshold": outcome.entry_threshold,
                "threshold_passed": outcome.entry_threshold_passed,
            }).execute()
        except Exception as exc:
            log.warning("ledger_scores dual-write failed (non-fatal): %s", exc)

    def append_capture_record(self, capture: "CaptureRecord") -> None:
        self.append(PatternLedgerRecord(
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
        ))

    def append_outcome_record(
        self,
        outcome: "PatternOutcome",
        previous_outcome: "str | None" = None,
    ) -> None:
        self.append(PatternLedgerRecord(
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
        ))
        # F-30 Phase 2: dual-write to ledger_outcomes
        try:
            _sb().table("ledger_outcomes").upsert({
                "id": outcome.id + ":outcome",
                "capture_id": outcome.capture_id or outcome.id,
                "pattern_slug": outcome.pattern_slug,
                "outcome": outcome.outcome or "pending",
                "max_gain_pct": outcome.max_gain_pct,
                "exit_return_pct": outcome.exit_return_pct,
                "duration_hours": outcome.duration_hours,
            }).execute()
        except Exception as exc:
            log.warning("ledger_outcomes dual-write failed (non-fatal): %s", exc)

    def append_verdict_record(self, outcome: "PatternOutcome") -> None:
        self.append(PatternLedgerRecord(
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
        ))
        # F-30 Phase 2: dual-write to ledger_verdicts
        try:
            _sb().table("ledger_verdicts").upsert({
                "id": outcome.id + ":verdict",
                "capture_id": outcome.capture_id or outcome.id,
                "pattern_slug": outcome.pattern_slug,
                "user_id": outcome.user_id or "",
                "verdict": outcome.user_verdict or "",
                "outcome_id": outcome.id,
                "note": outcome.user_note,
            }).execute()
        except Exception as exc:
            log.warning("ledger_verdicts dual-write failed (non-fatal): %s", exc)

    def append_phase_attempt_record(self, attempt: "PhaseAttemptRecord") -> None:
        self.append(PatternLedgerRecord(
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
        ))

    def append_model_record(
        self,
        *,
        pattern_slug: str,
        model_version: str,
        user_id: str | None = None,
        definition_ref: dict | None = None,
        payload: dict | None = None,
    ) -> None:
        self.append(PatternLedgerRecord(
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
        ))

    def append_training_run_record(
        self,
        *,
        pattern_slug: str,
        model_key: str,
        user_id: str | None = None,
        definition_ref: dict | None = None,
        payload: dict | None = None,
    ) -> None:
        self.append(PatternLedgerRecord(
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
        ))
