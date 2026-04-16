"""SQLite-backed Coin Screener store."""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from screener.types import ScreenerListing, ScreenerOverride, ScreenerRun

STATE_DIR = Path(__file__).resolve().parent.parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "screener.sqlite"
DEFAULT_SCREENED_UNIVERSE_MAX_AGE_S = 8 * 3600


def _json_dumps(value: object) -> str:
    return json.dumps(value if value is not None else {}, sort_keys=True, separators=(",", ":"))


def _json_loads_dict(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _json_loads_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [str(item) for item in data] if isinstance(data, list) else []


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


class ScreenerStore:
    """Local-first Screener persistence for latest listings and run logs."""

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
                CREATE TABLE IF NOT EXISTS screener_runs (
                  run_id TEXT PRIMARY KEY,
                  mode TEXT NOT NULL,
                  status TEXT NOT NULL,
                  started_at TEXT NOT NULL,
                  completed_at TEXT,
                  symbols_considered INTEGER NOT NULL DEFAULT 0,
                  symbols_scored INTEGER NOT NULL DEFAULT 0,
                  symbols_filtered_hard INTEGER NOT NULL DEFAULT 0,
                  grade_counts_json TEXT NOT NULL DEFAULT '{}',
                  used_fallback_universe INTEGER NOT NULL DEFAULT 0,
                  meta_json TEXT NOT NULL DEFAULT '{}'
                );

                CREATE INDEX IF NOT EXISTS idx_screener_runs_started
                  ON screener_runs(started_at DESC);

                CREATE TABLE IF NOT EXISTS screener_latest_listings (
                  symbol TEXT PRIMARY KEY,
                  run_id TEXT NOT NULL,
                  structural_score REAL NOT NULL,
                  structural_grade TEXT NOT NULL,
                  timing_score REAL NOT NULL,
                  timing_state TEXT NOT NULL,
                  composite_sort_score REAL NOT NULL,
                  confidence TEXT NOT NULL,
                  hard_filtered INTEGER NOT NULL DEFAULT 0,
                  status TEXT NOT NULL,
                  grade_flags_json TEXT NOT NULL DEFAULT '[]',
                  action_priority TEXT NOT NULL,
                  pattern_phase TEXT,
                  base_updated_at TEXT,
                  live_updated_at TEXT,
                  available_weight REAL NOT NULL DEFAULT 0.0,
                  missing_criteria_json TEXT NOT NULL DEFAULT '[]',
                  stale_criteria_json TEXT NOT NULL DEFAULT '[]',
                  meta_json TEXT NOT NULL DEFAULT '{}'
                );

                CREATE INDEX IF NOT EXISTS idx_screener_latest_grade_sort
                  ON screener_latest_listings(structural_grade, composite_sort_score DESC);

                CREATE TABLE IF NOT EXISTS screener_overrides (
                  override_id TEXT PRIMARY KEY,
                  scope TEXT NOT NULL,
                  target TEXT NOT NULL,
                  action TEXT NOT NULL,
                  reason TEXT NOT NULL,
                  author TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  expires_at TEXT,
                  meta_json TEXT NOT NULL DEFAULT '{}'
                );

                CREATE INDEX IF NOT EXISTS idx_screener_overrides_scope_target
                  ON screener_overrides(scope, target, created_at DESC);
                """
            )

    def create_run(self, *, mode: str, started_at: str) -> ScreenerRun:
        run_id = f"scr_{uuid.uuid4().hex[:12]}"
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO screener_runs (
                  run_id, mode, status, started_at, completed_at,
                  symbols_considered, symbols_scored, symbols_filtered_hard,
                  grade_counts_json, used_fallback_universe, meta_json
                ) VALUES (?, ?, 'pending', ?, NULL, 0, 0, 0, '{}', 0, '{}')
                """,
                (run_id, mode, started_at),
            )
        run = self.get_run(run_id)
        assert run is not None
        return run

    def complete_run(
        self,
        run_id: str,
        *,
        completed_at: str,
        symbols_considered: int,
        symbols_scored: int,
        symbols_filtered_hard: int,
        grade_counts: dict[str, int],
        used_fallback_universe: bool = False,
        meta: dict[str, Any] | None = None,
    ) -> ScreenerRun:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE screener_runs
                SET status = 'completed',
                    completed_at = ?,
                    symbols_considered = ?,
                    symbols_scored = ?,
                    symbols_filtered_hard = ?,
                    grade_counts_json = ?,
                    used_fallback_universe = ?,
                    meta_json = ?
                WHERE run_id = ?
                """,
                (
                    completed_at,
                    symbols_considered,
                    symbols_scored,
                    symbols_filtered_hard,
                    _json_dumps(grade_counts),
                    int(used_fallback_universe),
                    _json_dumps(meta or {}),
                    run_id,
                ),
            )
        run = self.get_run(run_id)
        assert run is not None
        return run

    def fail_run(self, run_id: str, *, completed_at: str, error: str) -> ScreenerRun:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE screener_runs
                SET status = 'failed',
                    completed_at = ?,
                    meta_json = ?
                WHERE run_id = ?
                """,
                (completed_at, _json_dumps({"error": error}), run_id),
            )
        run = self.get_run(run_id)
        assert run is not None
        return run

    def get_run(self, run_id: str) -> ScreenerRun | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM screener_runs WHERE run_id = ?", (run_id,)).fetchone()
        return self._row_to_run(row) if row else None

    def get_latest_run(self, *, status: str = "completed") -> ScreenerRun | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM screener_runs
                WHERE status = ?
                ORDER BY COALESCE(completed_at, started_at) DESC
                LIMIT 1
                """,
                (status,),
            ).fetchone()
        return self._row_to_run(row) if row else None

    def replace_latest_listings(self, run_id: str, listings: Iterable[ScreenerListing]) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM screener_latest_listings")
            conn.executemany(
                """
                INSERT INTO screener_latest_listings (
                  symbol, run_id, structural_score, structural_grade, timing_score,
                  timing_state, composite_sort_score, confidence, hard_filtered, status,
                  grade_flags_json, action_priority, pattern_phase, base_updated_at,
                  live_updated_at, available_weight, missing_criteria_json,
                  stale_criteria_json, meta_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        listing.symbol,
                        run_id,
                        listing.structural_score,
                        listing.structural_grade,
                        listing.timing_score,
                        listing.timing_state,
                        listing.composite_sort_score,
                        listing.confidence,
                        int(listing.hard_filtered),
                        listing.status,
                        _json_dumps(listing.grade_flags),
                        listing.action_priority,
                        listing.pattern_phase,
                        listing.base_updated_at,
                        listing.live_updated_at,
                        listing.available_weight,
                        _json_dumps(listing.missing_criteria),
                        _json_dumps(listing.stale_criteria),
                        _json_dumps(listing.meta),
                    )
                    for listing in listings
                ],
            )

    def get_latest_listing(self, symbol: str) -> ScreenerListing | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM screener_latest_listings WHERE symbol = ?",
                (symbol.upper(),),
            ).fetchone()
        return self._row_to_listing(row) if row else None

    def list_latest_listings(
        self,
        *,
        structural_grade: str | None = None,
        limit: int = 100,
        include_statuses: tuple[str, ...] = ("scored", "stale", "insufficient_data", "excluded"),
    ) -> list[ScreenerListing]:
        clauses: list[str] = []
        params: list[Any] = []
        if structural_grade is not None:
            clauses.append("structural_grade = ?")
            params.append(structural_grade)
        if include_statuses:
            placeholders = ",".join("?" for _ in include_statuses)
            clauses.append(f"status IN ({placeholders})")
            params.extend(include_statuses)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM screener_latest_listings
                {where}
                ORDER BY composite_sort_score DESC, symbol ASC
                LIMIT ?
                """,
                tuple(params),
            ).fetchall()
        return [self._row_to_listing(row) for row in rows]

    def list_filtered_symbols(
        self,
        *,
        structural_grades: tuple[str, ...] = ("A", "B"),
        confidence_levels: tuple[str, ...] = ("high", "medium"),
        max_symbols: int = 300,
        max_run_age_seconds: int = DEFAULT_SCREENED_UNIVERSE_MAX_AGE_S,
    ) -> list[str]:
        latest_run = self.get_latest_run(status="completed")
        if latest_run is None or not self._run_is_fresh(latest_run, max_run_age_seconds):
            return []
        grade_placeholders = ",".join("?" for _ in structural_grades)
        conf_placeholders = ",".join("?" for _ in confidence_levels)
        params: list[Any] = [*structural_grades, *confidence_levels, max_symbols]
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT symbol
                FROM screener_latest_listings
                WHERE structural_grade IN ({grade_placeholders})
                  AND confidence IN ({conf_placeholders})
                  AND hard_filtered = 0
                  AND status IN ('scored', 'stale')
                ORDER BY composite_sort_score DESC, symbol ASC
                LIMIT ?
                """,
                tuple(params),
            ).fetchall()
        return [str(row["symbol"]) for row in rows]

    def save_override(
        self,
        *,
        scope: str,
        target: str,
        action: str,
        reason: str,
        author: str,
        created_at: str,
        expires_at: str | None = None,
        meta: dict[str, Any] | None = None,
        override_id: str | None = None,
    ) -> ScreenerOverride:
        resolved_id = override_id or f"ovr_{uuid.uuid4().hex[:12]}"
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO screener_overrides (
                  override_id, scope, target, action, reason, author, created_at, expires_at, meta_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    resolved_id,
                    scope,
                    target,
                    action,
                    reason,
                    author,
                    created_at,
                    expires_at,
                    _json_dumps(meta or {}),
                ),
            )
        override = self.get_override(resolved_id)
        assert override is not None
        return override

    def get_override(self, override_id: str) -> ScreenerOverride | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM screener_overrides WHERE override_id = ?",
                (override_id,),
            ).fetchone()
        return self._row_to_override(row) if row else None

    def list_active_overrides(self, *, now_iso: str | None = None) -> list[ScreenerOverride]:
        now_value = _parse_iso(now_iso) if now_iso else datetime.now(timezone.utc)
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM screener_overrides ORDER BY created_at DESC"
            ).fetchall()
        result: list[ScreenerOverride] = []
        for row in rows:
            override = self._row_to_override(row)
            if override.expires_at:
                expires_at = _parse_iso(override.expires_at)
                if expires_at is not None and expires_at <= now_value:
                    continue
            result.append(override)
        return result

    @staticmethod
    def _run_is_fresh(run: ScreenerRun, max_run_age_seconds: int) -> bool:
        anchor = _parse_iso(run.completed_at or run.started_at)
        if anchor is None:
            return False
        return (datetime.now(timezone.utc) - anchor).total_seconds() <= max_run_age_seconds

    @staticmethod
    def _row_to_run(row: sqlite3.Row) -> ScreenerRun:
        return ScreenerRun(
            run_id=str(row["run_id"]),
            mode=str(row["mode"]),
            status=str(row["status"]),
            started_at=str(row["started_at"]),
            completed_at=str(row["completed_at"]) if row["completed_at"] else None,
            symbols_considered=int(row["symbols_considered"]),
            symbols_scored=int(row["symbols_scored"]),
            symbols_filtered_hard=int(row["symbols_filtered_hard"]),
            grade_counts=_json_loads_dict(row["grade_counts_json"]),
            used_fallback_universe=bool(row["used_fallback_universe"]),
            meta=_json_loads_dict(row["meta_json"]),
        )

    @staticmethod
    def _row_to_listing(row: sqlite3.Row) -> ScreenerListing:
        return ScreenerListing(
            symbol=str(row["symbol"]),
            run_id=str(row["run_id"]),
            structural_score=float(row["structural_score"]),
            structural_grade=str(row["structural_grade"]),
            timing_score=float(row["timing_score"]),
            timing_state=str(row["timing_state"]),
            composite_sort_score=float(row["composite_sort_score"]),
            confidence=str(row["confidence"]),
            hard_filtered=bool(row["hard_filtered"]),
            status=str(row["status"]),
            grade_flags=_json_loads_list(row["grade_flags_json"]),
            action_priority=str(row["action_priority"]),
            pattern_phase=str(row["pattern_phase"]) if row["pattern_phase"] else None,
            base_updated_at=str(row["base_updated_at"]) if row["base_updated_at"] else None,
            live_updated_at=str(row["live_updated_at"]) if row["live_updated_at"] else None,
            available_weight=float(row["available_weight"]),
            missing_criteria=_json_loads_list(row["missing_criteria_json"]),
            stale_criteria=_json_loads_list(row["stale_criteria_json"]),
            meta=_json_loads_dict(row["meta_json"]),
        )

    @staticmethod
    def _row_to_override(row: sqlite3.Row) -> ScreenerOverride:
        return ScreenerOverride(
            override_id=str(row["override_id"]),
            scope=str(row["scope"]),
            target=str(row["target"]),
            action=str(row["action"]),
            reason=str(row["reason"]),
            author=str(row["author"]),
            created_at=str(row["created_at"]),
            expires_at=str(row["expires_at"]) if row["expires_at"] else None,
            meta=_json_loads_dict(row["meta_json"]),
        )
