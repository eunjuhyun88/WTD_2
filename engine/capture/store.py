"""SQLite-backed CaptureRecord store."""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from capture.types import CaptureRecord

log = logging.getLogger("engine.capture")


def _supabase_upsert_bg(record: CaptureRecord) -> None:
    """Mirror a capture record to Supabase in a background thread.

    Fire-and-forget: failures are logged but never raised to callers.
    Skipped silently if SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are absent.
    """
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return
    try:
        from supabase import create_client  # type: ignore[import]
        sb = create_client(url, key)
        sb.table("capture_records").upsert(record.to_supabase_dict()).execute()
    except Exception as exc:
        log.warning("Supabase upsert failed (non-fatal): %s", exc)

STATE_DIR = Path(__file__).resolve().parent.parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "pattern_capture.sqlite"


def now_ms() -> int:
    return int(time.time() * 1000)


def _json_dumps(value: Any) -> str:
    return json.dumps(value if value is not None else {}, sort_keys=True, separators=(",", ":"))


def _json_dumps_optional(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _json_loads(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


class CaptureStore:
    """Local-first durable capture store."""

    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS capture_records (
                  capture_id TEXT PRIMARY KEY,
                  capture_kind TEXT NOT NULL,
                  user_id TEXT,
                  symbol TEXT NOT NULL,
                  pattern_slug TEXT NOT NULL,
                  pattern_version INTEGER NOT NULL DEFAULT 1,
                  definition_id TEXT,
                  definition_ref_json TEXT NOT NULL DEFAULT '{}',
                  phase TEXT NOT NULL,
                  timeframe TEXT NOT NULL,
                  captured_at_ms INTEGER NOT NULL,
                  candidate_transition_id TEXT,
                  candidate_id TEXT,
                  scan_id TEXT,
                  user_note TEXT,
                  chart_context_json TEXT NOT NULL,
                  research_context_json TEXT,
                  feature_snapshot_json TEXT,
                  block_scores_json TEXT NOT NULL,
                  verdict_id TEXT,
                  outcome_id TEXT,
                  status TEXT NOT NULL,
                  is_watching INTEGER NOT NULL DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_capture_records_transition
                  ON capture_records(candidate_transition_id);

                CREATE INDEX IF NOT EXISTS idx_capture_records_user_time
                  ON capture_records(user_id, captured_at_ms);

                CREATE INDEX IF NOT EXISTS idx_capture_records_pattern_symbol
                  ON capture_records(pattern_slug, symbol, timeframe);

                """
            )
            self._ensure_column(conn, "capture_records", "research_context_json", "TEXT")
            self._ensure_column(conn, "capture_records", "definition_id", "TEXT")
            self._ensure_column(
                conn,
                "capture_records",
                "definition_ref_json",
                "TEXT NOT NULL DEFAULT '{}'",
            )
            self._ensure_column(
                conn,
                "capture_records",
                "is_watching",
                "INTEGER NOT NULL DEFAULT 0",
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_capture_records_definition
                  ON capture_records(definition_id, captured_at_ms)
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_capture_records_is_watching
                  ON capture_records(is_watching, captured_at_ms)
                """
            )

    @staticmethod
    def _ensure_column(
        conn: sqlite3.Connection,
        table_name: str,
        column_name: str,
        column_definition: str,
    ) -> None:
        columns = {
            str(row["name"])
            for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        }
        if column_name in columns:
            return
        conn.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}"
        )

    def save(self, capture: CaptureRecord) -> CaptureRecord:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO capture_records (
                  capture_id, capture_kind, user_id, symbol, pattern_slug,
                  pattern_version, definition_id, definition_ref_json, phase, timeframe, captured_at_ms,
                  candidate_transition_id, candidate_id, scan_id, user_note,
                  chart_context_json, research_context_json, feature_snapshot_json, block_scores_json,
                  verdict_id, outcome_id, status, is_watching
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(capture_id) DO UPDATE SET
                  capture_kind=excluded.capture_kind,
                  user_id=excluded.user_id,
                  symbol=excluded.symbol,
                  pattern_slug=excluded.pattern_slug,
                  pattern_version=excluded.pattern_version,
                  definition_id=excluded.definition_id,
                  definition_ref_json=excluded.definition_ref_json,
                  phase=excluded.phase,
                  timeframe=excluded.timeframe,
                  captured_at_ms=excluded.captured_at_ms,
                  candidate_transition_id=excluded.candidate_transition_id,
                  candidate_id=excluded.candidate_id,
                  scan_id=excluded.scan_id,
                  user_note=excluded.user_note,
                  chart_context_json=excluded.chart_context_json,
                  research_context_json=excluded.research_context_json,
                  feature_snapshot_json=excluded.feature_snapshot_json,
                  block_scores_json=excluded.block_scores_json,
                  verdict_id=excluded.verdict_id,
                  outcome_id=excluded.outcome_id,
                  status=excluded.status
                """,
                (
                    capture.capture_id,
                    capture.capture_kind,
                    capture.user_id,
                    capture.symbol,
                    capture.pattern_slug,
                    capture.pattern_version,
                    capture.definition_id,
                    _json_dumps(capture.definition_ref),
                    capture.phase,
                    capture.timeframe,
                    capture.captured_at_ms,
                    capture.candidate_transition_id,
                    capture.candidate_id,
                    capture.scan_id,
                    capture.user_note,
                    _json_dumps(capture.chart_context),
                    _json_dumps_optional(capture.research_context),
                    _json_dumps(capture.feature_snapshot),
                    _json_dumps(capture.block_scores),
                    capture.verdict_id,
                    capture.outcome_id,
                    capture.status,
                    int(capture.is_watching),
                ),
            )
        # Mirror to Supabase asynchronously (fire-and-forget)
        threading.Thread(target=_supabase_upsert_bg, args=(capture,), daemon=True).start()
        return capture

    def load(self, capture_id: str) -> CaptureRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM capture_records WHERE capture_id = ?",
                (capture_id,),
            ).fetchone()
        return self._row_to_record(row) if row else None

    def list(
        self,
        *,
        user_id: str | None = None,
        pattern_slug: str | None = None,
        definition_id: str | None = None,
        symbol: str | None = None,
        status: str | None = None,
        is_watching: bool | None = None,
        limit: int = 100,
    ) -> list[CaptureRecord]:
        clauses: list[str] = []
        params: list[Any] = []
        if user_id is not None:
            clauses.append("user_id = ?")
            params.append(user_id)
        if pattern_slug is not None:
            clauses.append("pattern_slug = ?")
            params.append(pattern_slug)
        if definition_id is not None:
            slug, separator, version_token = definition_id.partition(":v")
            if separator == ":v" and version_token.isdigit():
                clauses.append(
                    "(definition_id = ? OR (definition_id IS NULL AND pattern_slug = ? AND pattern_version = ?))"
                )
                params.extend([definition_id, slug, int(version_token)])
            else:
                clauses.append("definition_id = ?")
                params.append(definition_id)
        if symbol is not None:
            clauses.append("symbol = ?")
            params.append(symbol)
        if status is not None:
            clauses.append("status = ?")
            params.append(status)
        if is_watching is not None:
            clauses.append("is_watching = ?")
            params.append(int(is_watching))
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM capture_records {where} ORDER BY captured_at_ms DESC LIMIT ?",
                tuple(params),
            ).fetchall()
        return [self._row_to_record(row) for row in rows]

    def list_due_for_outcome(
        self,
        *,
        now_ms_val: int,
        window_hours: float = 72.0,
        limit: int = 500,
    ) -> list[CaptureRecord]:
        """Return pending_outcome captures whose evaluation window has elapsed."""
        cutoff_ms = now_ms_val - int(window_hours * 3600 * 1000)
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM capture_records
                WHERE status = 'pending_outcome' AND captured_at_ms <= ?
                ORDER BY captured_at_ms ASC
                LIMIT ?
                """,
                (cutoff_ms, limit),
            ).fetchall()
        return [self._row_to_record(row) for row in rows]

    def count_by_status(self) -> dict[str, int]:
        """Return status → count for all capture records (single GROUP BY query)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT status, COUNT(*) AS n FROM capture_records GROUP BY status"
            ).fetchall()
        return {row["status"]: int(row["n"]) for row in rows}

    def update_status(
        self,
        capture_id: str,
        status: str,
        *,
        outcome_id: str | None = None,
        verdict_id: str | None = None,
    ) -> bool:
        """Update a capture's lifecycle status, optionally linking outcome/verdict."""
        sets = ["status = ?"]
        params: list[Any] = [status]
        if outcome_id is not None:
            sets.append("outcome_id = ?")
            params.append(outcome_id)
        if verdict_id is not None:
            sets.append("verdict_id = ?")
            params.append(verdict_id)
        params.append(capture_id)
        with self._connect() as conn:
            cur = conn.execute(
                f"UPDATE capture_records SET {', '.join(sets)} WHERE capture_id = ?",
                tuple(params),
            )
            updated = cur.rowcount > 0
        if updated:
            # Mirror updated record to Supabase
            record = self.load(capture_id)
            if record:
                threading.Thread(target=_supabase_upsert_bg, args=(record,), daemon=True).start()
        return updated

    def set_watching(self, capture_id: str, watching: bool = True) -> bool:
        """Set is_watching flag for a capture. Idempotent.

        Returns True if the capture was found, False if not found.
        """
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE capture_records SET is_watching = ? WHERE capture_id = ?",
                (int(watching), capture_id),
            )
            found = cur.rowcount > 0
        if found:
            record = self.load(capture_id)
            if record:
                threading.Thread(target=_supabase_upsert_bg, args=(record,), daemon=True).start()
        return found

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> CaptureRecord:
        keys = set(row.keys())
        return CaptureRecord(
            capture_id=row["capture_id"],
            capture_kind=row["capture_kind"],
            user_id=row["user_id"],
            symbol=row["symbol"],
            pattern_slug=row["pattern_slug"],
            pattern_version=int(row["pattern_version"]),
            definition_id=row["definition_id"],
            definition_ref=_json_loads(row["definition_ref_json"], {}),
            phase=row["phase"],
            timeframe=row["timeframe"],
            captured_at_ms=int(row["captured_at_ms"]),
            candidate_transition_id=row["candidate_transition_id"],
            candidate_id=row["candidate_id"],
            scan_id=row["scan_id"],
            user_note=row["user_note"],
            chart_context=_json_loads(row["chart_context_json"], {}),
            research_context=_json_loads(row["research_context_json"], None),
            feature_snapshot=_json_loads(row["feature_snapshot_json"], None),
            block_scores=_json_loads(row["block_scores_json"], {}),
            verdict_id=row["verdict_id"],
            outcome_id=row["outcome_id"],
            status=row["status"],
            is_watching=bool(row["is_watching"]) if "is_watching" in keys else False,
        )
