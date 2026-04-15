"""Durable Pattern Runtime state store."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from patterns.types import PatternObject, PatternStateRecord, PhaseTransition, PhaseTransitionRecord

STATE_DIR = Path(__file__).resolve().parent.parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "pattern_runtime.sqlite"


def _dt_to_ms(value: datetime | None) -> int | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)


def _ms_to_dt(value: int | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc)


def _json_dumps(value: Any) -> str:
    return json.dumps(value if value is not None else {}, sort_keys=True, separators=(",", ":"))


def _json_loads(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


class PatternStateStore:
    """SQLite WAL-backed store for pattern states and transition evidence."""

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
                CREATE TABLE IF NOT EXISTS pattern_states (
                  symbol TEXT NOT NULL,
                  pattern_slug TEXT NOT NULL,
                  pattern_version INTEGER NOT NULL DEFAULT 1,
                  timeframe TEXT NOT NULL,
                  current_phase TEXT NOT NULL,
                  current_phase_idx INTEGER NOT NULL,
                  entered_at INTEGER,
                  bars_in_phase INTEGER NOT NULL DEFAULT 0,
                  last_eval_at INTEGER,
                  last_transition_id TEXT,
                  active INTEGER NOT NULL DEFAULT 1,
                  invalidated INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL,
                  PRIMARY KEY (symbol, pattern_slug, timeframe)
                );

                CREATE TABLE IF NOT EXISTS phase_transitions (
                  transition_id TEXT PRIMARY KEY,
                  symbol TEXT NOT NULL,
                  pattern_slug TEXT NOT NULL,
                  pattern_version INTEGER NOT NULL DEFAULT 1,
                  timeframe TEXT NOT NULL,
                  from_phase TEXT,
                  to_phase TEXT NOT NULL,
                  from_phase_idx INTEGER,
                  to_phase_idx INTEGER NOT NULL,
                  transition_kind TEXT NOT NULL,
                  reason TEXT NOT NULL,
                  transitioned_at INTEGER NOT NULL,
                  trigger_bar_ts INTEGER,
                  scan_id TEXT,
                  confidence REAL NOT NULL,
                  block_scores_json TEXT NOT NULL,
                  blocks_triggered_json TEXT NOT NULL,
                  feature_snapshot_json TEXT,
                  data_quality_json TEXT,
                  created_at INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_phase_transitions_symbol_pattern_time
                  ON phase_transitions(symbol, pattern_slug, timeframe, transitioned_at);

                CREATE INDEX IF NOT EXISTS idx_phase_transitions_scan
                  ON phase_transitions(scan_id);
                """
            )

    @staticmethod
    def _transition_to_record(transition: PhaseTransition) -> PhaseTransitionRecord:
        block_scores = transition.block_scores or {
            block: {"passed": True, "score": 1.0}
            for block in transition.blocks_triggered
        }
        return PhaseTransitionRecord(
            transition_id=transition.transition_id,
            symbol=transition.symbol,
            pattern_slug=transition.pattern_slug,
            pattern_version=transition.pattern_version,
            timeframe=transition.timeframe,
            from_phase=transition.from_phase,
            to_phase=transition.to_phase,
            from_phase_idx=transition.from_phase_idx,
            to_phase_idx=transition.to_phase_idx or 0,
            transition_kind=transition.transition_kind,
            reason=transition.reason,
            transitioned_at=transition.timestamp,
            trigger_bar_ts=transition.trigger_bar_ts,
            scan_id=transition.scan_id,
            confidence=transition.confidence,
            block_scores=block_scores,
            blocks_triggered=transition.blocks_triggered,
            feature_snapshot=transition.feature_snapshot,
            data_quality=transition.data_quality,
        )

    def append_transition(self, transition: PhaseTransition) -> PhaseTransitionRecord:
        """Append transition event and update current-state snapshot."""
        record = self._transition_to_record(transition)
        now = datetime.now(timezone.utc)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO phase_transitions (
                  transition_id, symbol, pattern_slug, pattern_version, timeframe,
                  from_phase, to_phase, from_phase_idx, to_phase_idx,
                  transition_kind, reason, transitioned_at, trigger_bar_ts, scan_id,
                  confidence, block_scores_json, blocks_triggered_json,
                  feature_snapshot_json, data_quality_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.transition_id, record.symbol, record.pattern_slug,
                    record.pattern_version, record.timeframe, record.from_phase,
                    record.to_phase, record.from_phase_idx, record.to_phase_idx,
                    record.transition_kind, record.reason, _dt_to_ms(record.transitioned_at),
                    _dt_to_ms(record.trigger_bar_ts), record.scan_id, record.confidence,
                    _json_dumps(record.block_scores), _json_dumps(record.blocks_triggered),
                    _json_dumps(record.feature_snapshot), _json_dumps(record.data_quality),
                    _dt_to_ms(record.created_at),
                ),
            )
            entered_at = None if record.transition_kind == "timeout_reset" else record.transitioned_at
            conn.execute(
                """
                INSERT INTO pattern_states (
                  symbol, pattern_slug, pattern_version, timeframe,
                  current_phase, current_phase_idx, entered_at, bars_in_phase,
                  last_eval_at, last_transition_id, active, invalidated, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol, pattern_slug, timeframe) DO UPDATE SET
                  pattern_version=excluded.pattern_version,
                  current_phase=excluded.current_phase,
                  current_phase_idx=excluded.current_phase_idx,
                  entered_at=excluded.entered_at,
                  bars_in_phase=excluded.bars_in_phase,
                  last_eval_at=excluded.last_eval_at,
                  last_transition_id=excluded.last_transition_id,
                  active=excluded.active,
                  invalidated=excluded.invalidated,
                  updated_at=excluded.updated_at
                """,
                (
                    record.symbol, record.pattern_slug, record.pattern_version,
                    record.timeframe, record.to_phase, record.to_phase_idx,
                    _dt_to_ms(entered_at), 0 if entered_at is None else 1,
                    _dt_to_ms(record.transitioned_at), record.transition_id,
                    1, 0, _dt_to_ms(now),
                ),
            )
        return record

    def list_states(self, pattern_slug: str | None = None) -> list[PatternStateRecord]:
        sql = "SELECT * FROM pattern_states WHERE active = 1"
        params: tuple[Any, ...] = ()
        if pattern_slug:
            sql += " AND pattern_slug = ?"
            params = (pattern_slug,)
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_state(row) for row in rows]

    def hydrate_states(self, pattern: PatternObject) -> dict[str, PatternStateRecord]:
        return {
            state.symbol: state
            for state in self.list_states(pattern.slug)
            if state.timeframe == pattern.timeframe
        }

    def get_transition(self, transition_id: str) -> PhaseTransitionRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM phase_transitions WHERE transition_id = ?",
                (transition_id,),
            ).fetchone()
        return self._row_to_transition(row) if row else None

    def list_transitions(self, pattern_slug: str | None = None) -> list[PhaseTransitionRecord]:
        sql = "SELECT * FROM phase_transitions"
        params: tuple[Any, ...] = ()
        if pattern_slug:
            sql += " WHERE pattern_slug = ?"
            params = (pattern_slug,)
        sql += " ORDER BY transitioned_at ASC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_transition(row) for row in rows]

    @staticmethod
    def _row_to_state(row: sqlite3.Row) -> PatternStateRecord:
        return PatternStateRecord(
            symbol=row["symbol"],
            pattern_slug=row["pattern_slug"],
            pattern_version=int(row["pattern_version"]),
            timeframe=row["timeframe"],
            current_phase=row["current_phase"],
            current_phase_idx=int(row["current_phase_idx"]),
            entered_at=_ms_to_dt(row["entered_at"]),
            bars_in_phase=int(row["bars_in_phase"]),
            last_eval_at=_ms_to_dt(row["last_eval_at"]),
            last_transition_id=row["last_transition_id"],
            active=bool(row["active"]),
            invalidated=bool(row["invalidated"]),
            updated_at=_ms_to_dt(row["updated_at"]) or datetime.now(timezone.utc),
        )

    @staticmethod
    def _row_to_transition(row: sqlite3.Row) -> PhaseTransitionRecord:
        return PhaseTransitionRecord(
            transition_id=row["transition_id"],
            symbol=row["symbol"],
            pattern_slug=row["pattern_slug"],
            pattern_version=int(row["pattern_version"]),
            timeframe=row["timeframe"],
            from_phase=row["from_phase"],
            to_phase=row["to_phase"],
            from_phase_idx=row["from_phase_idx"],
            to_phase_idx=int(row["to_phase_idx"]),
            transition_kind=row["transition_kind"],
            reason=row["reason"],
            transitioned_at=_ms_to_dt(row["transitioned_at"]) or datetime.now(timezone.utc),
            trigger_bar_ts=_ms_to_dt(row["trigger_bar_ts"]),
            scan_id=row["scan_id"],
            confidence=float(row["confidence"]),
            block_scores=_json_loads(row["block_scores_json"], {}),
            blocks_triggered=_json_loads(row["blocks_triggered_json"], []),
            feature_snapshot=_json_loads(row["feature_snapshot_json"], None),
            data_quality=_json_loads(row["data_quality_json"], None),
            created_at=_ms_to_dt(row["created_at"]) or datetime.now(timezone.utc),
        )
