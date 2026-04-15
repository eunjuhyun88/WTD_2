"""SQLite-backed CaptureRecord store."""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any

from capture.types import CaptureRecord

STATE_DIR = Path(__file__).resolve().parent.parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "pattern_capture.sqlite"


def now_ms() -> int:
    return int(time.time() * 1000)


def _json_dumps(value: Any) -> str:
    return json.dumps(value if value is not None else {}, sort_keys=True, separators=(",", ":"))


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
                  phase TEXT NOT NULL,
                  timeframe TEXT NOT NULL,
                  captured_at_ms INTEGER NOT NULL,
                  candidate_transition_id TEXT,
                  candidate_id TEXT,
                  scan_id TEXT,
                  user_note TEXT,
                  chart_context_json TEXT NOT NULL,
                  feature_snapshot_json TEXT,
                  block_scores_json TEXT NOT NULL,
                  verdict_id TEXT,
                  outcome_id TEXT,
                  status TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_capture_records_transition
                  ON capture_records(candidate_transition_id);

                CREATE INDEX IF NOT EXISTS idx_capture_records_user_time
                  ON capture_records(user_id, captured_at_ms);

                CREATE INDEX IF NOT EXISTS idx_capture_records_pattern_symbol
                  ON capture_records(pattern_slug, symbol, timeframe);
                """
            )

    def save(self, capture: CaptureRecord) -> CaptureRecord:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO capture_records (
                  capture_id, capture_kind, user_id, symbol, pattern_slug,
                  pattern_version, phase, timeframe, captured_at_ms,
                  candidate_transition_id, candidate_id, scan_id, user_note,
                  chart_context_json, feature_snapshot_json, block_scores_json,
                  verdict_id, outcome_id, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(capture_id) DO UPDATE SET
                  capture_kind=excluded.capture_kind,
                  user_id=excluded.user_id,
                  symbol=excluded.symbol,
                  pattern_slug=excluded.pattern_slug,
                  pattern_version=excluded.pattern_version,
                  phase=excluded.phase,
                  timeframe=excluded.timeframe,
                  captured_at_ms=excluded.captured_at_ms,
                  candidate_transition_id=excluded.candidate_transition_id,
                  candidate_id=excluded.candidate_id,
                  scan_id=excluded.scan_id,
                  user_note=excluded.user_note,
                  chart_context_json=excluded.chart_context_json,
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
                    capture.phase,
                    capture.timeframe,
                    capture.captured_at_ms,
                    capture.candidate_transition_id,
                    capture.candidate_id,
                    capture.scan_id,
                    capture.user_note,
                    _json_dumps(capture.chart_context),
                    _json_dumps(capture.feature_snapshot),
                    _json_dumps(capture.block_scores),
                    capture.verdict_id,
                    capture.outcome_id,
                    capture.status,
                ),
            )
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
        symbol: str | None = None,
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
        if symbol is not None:
            clauses.append("symbol = ?")
            params.append(symbol)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT * FROM capture_records {where} ORDER BY captured_at_ms DESC LIMIT ?",
                tuple(params),
            ).fetchall()
        return [self._row_to_record(row) for row in rows]

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> CaptureRecord:
        return CaptureRecord(
            capture_id=row["capture_id"],
            capture_kind=row["capture_kind"],
            user_id=row["user_id"],
            symbol=row["symbol"],
            pattern_slug=row["pattern_slug"],
            pattern_version=int(row["pattern_version"]),
            phase=row["phase"],
            timeframe=row["timeframe"],
            captured_at_ms=int(row["captured_at_ms"]),
            candidate_transition_id=row["candidate_transition_id"],
            candidate_id=row["candidate_id"],
            scan_id=row["scan_id"],
            user_note=row["user_note"],
            chart_context=_json_loads(row["chart_context_json"], {}),
            feature_snapshot=_json_loads(row["feature_snapshot_json"], None),
            block_scores=_json_loads(row["block_scores_json"], {}),
            verdict_id=row["verdict_id"],
            outcome_id=row["outcome_id"],
            status=row["status"],
        )
