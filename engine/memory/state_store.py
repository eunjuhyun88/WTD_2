"""Durable memory feedback/debug state store."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from api.schemas_memory import (
    MemoryDebugSessionRequest,
    MemoryFeedbackRequest,
    MemoryRejectedLookupRequest,
    MemoryRejectedRecord,
)

STATE_DIR = Path(__file__).resolve().parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "memory_runtime.sqlite"

# Per-user verdict weight deltas
_VERDICT_DELTA: dict[str, float] = {
    "valid": 0.05,
    "near_miss": 0.02,
    "too_early": 0.01,
    "too_late": 0.01,
    "invalid": -0.08,
}
_WEIGHT_CAP = 1.0
_COLD_START_MIN_VERDICTS = 5


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class UserVerdictWeightStore:
    """Per-user verdict-feedback weight adjustments, SQLite-backed.

    Schema: (user_id, context_tag) → (delta, verdict_count)
    context_tag examples: "symbol:BTCUSDT", "timeframe:4h", "intent:scalp"
    """

    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_table()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def _init_table(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS user_verdict_weights (
                  user_id     TEXT NOT NULL,
                  context_tag TEXT NOT NULL,
                  delta       REAL NOT NULL DEFAULT 0.0,
                  verdict_count INTEGER NOT NULL DEFAULT 0,
                  updated_at  TEXT NOT NULL,
                  PRIMARY KEY (user_id, context_tag)
                );
                """
            )

    def apply(self, user_id: str, context_tags: list[str], verdict: str) -> None:
        """Apply a verdict delta to each context_tag for this user."""
        raw_delta = _VERDICT_DELTA.get(verdict, 0.0)
        if raw_delta == 0.0:
            return
        now = _utcnow()
        with self._connect() as conn:
            for tag in context_tags:
                conn.execute(
                    """
                    INSERT INTO user_verdict_weights (user_id, context_tag, delta, verdict_count, updated_at)
                    VALUES (?, ?, ?, 1, ?)
                    ON CONFLICT(user_id, context_tag) DO UPDATE SET
                      delta = MAX(-?, MIN(?, delta + ?)),
                      verdict_count = verdict_count + 1,
                      updated_at = excluded.updated_at
                    """,
                    (user_id, tag, max(-_WEIGHT_CAP, min(_WEIGHT_CAP, raw_delta)), now,
                     _WEIGHT_CAP, _WEIGHT_CAP, raw_delta),
                )

    def get_adjustments(self, user_id: str) -> dict[str, float]:
        """Return {context_tag: delta} for the user. Empty dict on cold start."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT context_tag, delta, verdict_count FROM user_verdict_weights WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        total_verdicts = sum(r["verdict_count"] for r in rows)
        if total_verdicts < _COLD_START_MIN_VERDICTS:
            return {}  # cold start: baseline weights
        return {r["context_tag"]: r["delta"] for r in rows}

    def get_total_verdict_count(self, user_id: str) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(SUM(verdict_count), 0) as total FROM user_verdict_weights WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return int(row["total"])


USER_VERDICT_WEIGHT_STORE = UserVerdictWeightStore()


def _json_dumps(value: object) -> str:
    return json.dumps(value if value is not None else [], sort_keys=True, separators=(",", ":"))


def _json_loads(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


class MemoryStateStore:
    """SQLite WAL-backed store for feedback counters and debug hypotheses."""

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
                CREATE TABLE IF NOT EXISTS memory_feedback_counts (
                  memory_id TEXT PRIMARY KEY,
                  access_count INTEGER NOT NULL DEFAULT 0,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS memory_debug_hypotheses (
                  session_id TEXT NOT NULL,
                  hypothesis_id TEXT NOT NULL,
                  text TEXT NOT NULL,
                  status TEXT NOT NULL,
                  rejection_reason TEXT,
                  symbol TEXT,
                  timeframe TEXT,
                  intent TEXT,
                  evidence_json TEXT NOT NULL DEFAULT '[]',
                  started_at TEXT NOT NULL,
                  ended_at TEXT,
                  updated_at TEXT NOT NULL,
                  PRIMARY KEY (session_id, hypothesis_id)
                );

                CREATE INDEX IF NOT EXISTS idx_memory_debug_lookup
                  ON memory_debug_hypotheses(status, symbol, intent, updated_at DESC);
                """
            )

    def apply_feedback(self, payload: MemoryFeedbackRequest, updated_at: str) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT access_count FROM memory_feedback_counts WHERE memory_id = ?",
                (payload.memory_id,),
            ).fetchone()
            current = int(row["access_count"]) if row else 0
            if payload.event in {"retrieved", "used", "confirmed"}:
                current += 1
            conn.execute(
                """
                INSERT INTO memory_feedback_counts (memory_id, access_count, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(memory_id) DO UPDATE SET
                  access_count = excluded.access_count,
                  updated_at = excluded.updated_at
                """,
                (payload.memory_id, current, updated_at),
            )
        return current

    def record_debug_session(self, payload: MemoryDebugSessionRequest, updated_at: str) -> int:
        rejected_indexed = 0
        with self._connect() as conn:
            for hypothesis in payload.hypotheses:
                conn.execute(
                    """
                    INSERT INTO memory_debug_hypotheses (
                      session_id, hypothesis_id, text, status, rejection_reason,
                      symbol, timeframe, intent, evidence_json, started_at, ended_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(session_id, hypothesis_id) DO UPDATE SET
                      text = excluded.text,
                      status = excluded.status,
                      rejection_reason = excluded.rejection_reason,
                      symbol = excluded.symbol,
                      timeframe = excluded.timeframe,
                      intent = excluded.intent,
                      evidence_json = excluded.evidence_json,
                      started_at = excluded.started_at,
                      ended_at = excluded.ended_at,
                      updated_at = excluded.updated_at
                    """,
                    (
                        payload.session_id,
                        hypothesis.id,
                        hypothesis.text,
                        hypothesis.status,
                        hypothesis.rejection_reason,
                        payload.context.symbol,
                        payload.context.timeframe,
                        payload.context.intent,
                        _json_dumps(hypothesis.evidence),
                        payload.started_at,
                        payload.ended_at,
                        updated_at,
                    ),
                )
                if hypothesis.status == "rejected":
                    rejected_indexed += 1
        return rejected_indexed

    def search_rejected(self, payload: MemoryRejectedLookupRequest) -> list[MemoryRejectedRecord]:
        query = [
            "SELECT session_id, hypothesis_id, text, rejection_reason, symbol, intent, updated_at",
            "FROM memory_debug_hypotheses",
            "WHERE status = 'rejected'",
        ]
        params: list[object] = []
        if payload.symbol:
            query.append("AND lower(symbol) = ?")
            params.append(payload.symbol.lower())
        if payload.intent:
            query.append("AND lower(intent) = ?")
            params.append(payload.intent.lower())
        if payload.query:
            query.append("AND lower(text || ' ' || coalesce(rejection_reason, '')) LIKE ?")
            params.append(f"%{payload.query.lower()}%")
        query.append("ORDER BY updated_at DESC")
        query.append("LIMIT ?")
        params.append(payload.limit)

        with self._connect() as conn:
            rows = conn.execute(" ".join(query), tuple(params)).fetchall()
        return [
            MemoryRejectedRecord(
                id=row["hypothesis_id"],
                session_id=row["session_id"],
                text=row["text"],
                rejection_reason=row["rejection_reason"],
                symbol=row["symbol"],
                intent=row["intent"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]
