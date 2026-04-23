"""SQLite-backed runtime workflow state repository."""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STATE_DIR = Path(__file__).resolve().parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "runtime_state.sqlite"


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_dumps(value: Any) -> str:
    return json.dumps(value if value is not None else {}, sort_keys=True, separators=(",", ":"))


def _json_loads_dict(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _definition_id_from_ref(definition_ref: dict[str, Any] | None) -> str | None:
    if not isinstance(definition_ref, dict):
        return None
    value = definition_ref.get("definition_id")
    return value if isinstance(value, str) and value else None


class RuntimeStateStore:
    """Durable fallback-local store for workflow state not owned by facts/search."""

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
                CREATE TABLE IF NOT EXISTS runtime_workspace_pins (
                  pin_id TEXT PRIMARY KEY,
                  symbol TEXT NOT NULL,
                  timeframe TEXT,
                  user_id TEXT,
                  kind TEXT NOT NULL,
                  summary TEXT,
                  payload_json TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_runtime_workspace_pins_symbol
                  ON runtime_workspace_pins(symbol, updated_at DESC);

                CREATE TABLE IF NOT EXISTS runtime_saved_setups (
                  setup_id TEXT PRIMARY KEY,
                  symbol TEXT,
                  timeframe TEXT,
                  user_id TEXT,
                  title TEXT,
                  summary TEXT,
                  payload_json TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS runtime_research_contexts (
                  context_id TEXT PRIMARY KEY,
                  symbol TEXT,
                  pattern_slug TEXT,
                  user_id TEXT,
                  title TEXT,
                  summary TEXT,
                  payload_json TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS runtime_ledger_entries (
                  ledger_id TEXT PRIMARY KEY,
                  subject_id TEXT,
                  kind TEXT NOT NULL,
                  summary TEXT,
                  definition_id TEXT,
                  definition_ref_json TEXT NOT NULL DEFAULT '{}',
                  payload_json TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_runtime_ledger_entries_definition
                  ON runtime_ledger_entries(definition_id, updated_at DESC);
                """
            )
            self._ensure_column(
                conn,
                "runtime_ledger_entries",
                "definition_id",
                "TEXT",
            )
            self._ensure_column(
                conn,
                "runtime_ledger_entries",
                "definition_ref_json",
                "TEXT NOT NULL DEFAULT '{}'",
            )
            self._backfill_runtime_ledger_definition_ids(conn)

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

    @staticmethod
    def _backfill_runtime_ledger_definition_ids(conn: sqlite3.Connection) -> None:
        rows = conn.execute(
            """
            SELECT ledger_id, definition_ref_json
            FROM runtime_ledger_entries
            WHERE COALESCE(definition_id, '') = ''
            """
        ).fetchall()
        for row in rows:
            definition_id = _definition_id_from_ref(_json_loads_dict(row["definition_ref_json"]))
            if not definition_id:
                continue
            conn.execute(
                "UPDATE runtime_ledger_entries SET definition_id = ? WHERE ledger_id = ?",
                (definition_id, row["ledger_id"]),
            )

    def save_workspace_pin(
        self,
        *,
        symbol: str,
        kind: str,
        timeframe: str | None = None,
        user_id: str | None = None,
        summary: str | None = None,
        payload: dict[str, Any] | None = None,
        pin_id: str | None = None,
    ) -> dict[str, Any]:
        normalized_symbol = symbol.upper()
        now = utcnow_iso()
        pin_id = pin_id or str(uuid.uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO runtime_workspace_pins (
                  pin_id, symbol, timeframe, user_id, kind, summary,
                  payload_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(pin_id) DO UPDATE SET
                  symbol=excluded.symbol,
                  timeframe=excluded.timeframe,
                  user_id=excluded.user_id,
                  kind=excluded.kind,
                  summary=excluded.summary,
                  payload_json=excluded.payload_json,
                  updated_at=excluded.updated_at
                """,
                (
                    pin_id,
                    normalized_symbol,
                    timeframe,
                    user_id,
                    kind,
                    summary,
                    _json_dumps(payload or {}),
                    now,
                    now,
                ),
            )
        return self.get_workspace(normalized_symbol, user_id=user_id)

    def get_workspace(self, symbol: str, *, user_id: str | None = None) -> dict[str, Any]:
        normalized_symbol = symbol.upper()
        clauses = ["symbol = ?"]
        params: list[Any] = [normalized_symbol]
        if user_id is not None:
            clauses.append("user_id = ?")
            params.append(user_id)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT * FROM runtime_workspace_pins
                WHERE {' AND '.join(clauses)}
                ORDER BY updated_at DESC
                """,
                params,
            ).fetchall()
        pins = [
            {
                "id": row["pin_id"],
                "kind": row["kind"],
                "summary": row["summary"],
                "symbol": row["symbol"],
                "timeframe": row["timeframe"],
                "payload": _json_loads_dict(row["payload_json"]),
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]
        return {
            "symbol": normalized_symbol,
            "pins": pins,
            "compare_ids": [],
            "updated_at": pins[0]["updated_at"] if pins else utcnow_iso(),
        }

    def create_setup(self, payload: dict[str, Any]) -> dict[str, Any]:
        setup_id = str(payload.get("setup_id") or uuid.uuid4())
        now = utcnow_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO runtime_saved_setups (
                  setup_id, symbol, timeframe, user_id, title, summary,
                  payload_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(setup_id) DO UPDATE SET
                  symbol=excluded.symbol,
                  timeframe=excluded.timeframe,
                  user_id=excluded.user_id,
                  title=excluded.title,
                  summary=excluded.summary,
                  payload_json=excluded.payload_json,
                  updated_at=excluded.updated_at
                """,
                (
                    setup_id,
                    payload.get("symbol"),
                    payload.get("timeframe"),
                    payload.get("user_id"),
                    payload.get("title"),
                    payload.get("summary"),
                    _json_dumps(payload),
                    now,
                    now,
                ),
            )
        saved = self.get_setup(setup_id)
        assert saved is not None
        return saved

    def get_setup(self, setup_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM runtime_saved_setups WHERE setup_id = ?",
                (setup_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "id": row["setup_id"],
            "symbol": row["symbol"],
            "timeframe": row["timeframe"],
            "title": row["title"],
            "summary": row["summary"],
            "payload": _json_loads_dict(row["payload_json"]),
            "updated_at": row["updated_at"],
        }

    def create_research_context(self, payload: dict[str, Any]) -> dict[str, Any]:
        context_id = str(payload.get("id") or payload.get("context_id") or uuid.uuid4())
        now = utcnow_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO runtime_research_contexts (
                  context_id, symbol, pattern_slug, user_id, title, summary,
                  payload_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(context_id) DO UPDATE SET
                  symbol=excluded.symbol,
                  pattern_slug=excluded.pattern_slug,
                  user_id=excluded.user_id,
                  title=excluded.title,
                  summary=excluded.summary,
                  payload_json=excluded.payload_json,
                  updated_at=excluded.updated_at
                """,
                (
                    context_id,
                    payload.get("symbol"),
                    payload.get("pattern_slug"),
                    payload.get("user_id"),
                    payload.get("title"),
                    payload.get("summary"),
                    _json_dumps(payload),
                    now,
                    now,
                ),
            )
        context = self.get_research_context(context_id)
        assert context is not None
        return context

    def get_research_context(self, context_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM runtime_research_contexts WHERE context_id = ?",
                (context_id,),
            ).fetchone()
        if row is None:
            return None
        payload = _json_loads_dict(row["payload_json"])
        return {
            "id": row["context_id"],
            "title": row["title"],
            "summary": row["summary"],
            "fact_refs": payload.get("fact_refs") if isinstance(payload.get("fact_refs"), list) else [],
            "search_refs": payload.get("search_refs") if isinstance(payload.get("search_refs"), list) else [],
            "payload": payload,
            "updated_at": row["updated_at"],
        }

    def upsert_ledger_entry(
        self,
        *,
        ledger_id: str,
        kind: str,
        subject_id: str | None = None,
        summary: str | None = None,
        definition_ref: dict[str, Any] | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = utcnow_iso()
        resolved_definition_ref = dict(definition_ref or {})
        definition_id = _definition_id_from_ref(resolved_definition_ref)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO runtime_ledger_entries (
                  ledger_id, subject_id, kind, summary, definition_id, definition_ref_json, payload_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(ledger_id) DO UPDATE SET
                  subject_id=excluded.subject_id,
                  kind=excluded.kind,
                  summary=excluded.summary,
                  definition_id=excluded.definition_id,
                  definition_ref_json=excluded.definition_ref_json,
                  payload_json=excluded.payload_json,
                  updated_at=excluded.updated_at
                """,
                (
                    ledger_id,
                    subject_id,
                    kind,
                    summary,
                    definition_id,
                    _json_dumps(resolved_definition_ref),
                    _json_dumps(payload or {}),
                    now,
                    now,
                ),
            )
        entry = self.get_ledger_entry(ledger_id)
        assert entry is not None
        return entry

    def get_ledger_entry(self, ledger_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM runtime_ledger_entries WHERE ledger_id = ?",
                (ledger_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_ledger_entry(row)

    def list_ledger_entries(
        self,
        *,
        definition_id: str | None = None,
        kind: str | None = None,
        subject_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        query = ["SELECT * FROM runtime_ledger_entries WHERE 1=1"]
        params: list[Any] = []
        if definition_id:
            query.append("AND definition_id = ?")
            params.append(definition_id)
        if kind:
            query.append("AND kind = ?")
            params.append(kind)
        if subject_id:
            query.append("AND subject_id = ?")
            params.append(subject_id)
        query.append("ORDER BY updated_at DESC")
        query.append("LIMIT ?")
        params.append(max(1, min(limit, 500)))
        with self._connect() as conn:
            rows = conn.execute(" ".join(query), tuple(params)).fetchall()
        return [self._row_to_ledger_entry(row) for row in rows]

    def _row_to_ledger_entry(self, row: sqlite3.Row) -> dict[str, Any]:
        payload = _json_loads_dict(row["payload_json"])
        return {
            "id": row["ledger_id"],
            "kind": row["kind"],
            "subject_id": row["subject_id"],
            "definition_id": row["definition_id"],
            "definition_ref": _json_loads_dict(row["definition_ref_json"]),
            "verdict": payload.get("verdict"),
            "outcome": payload.get("outcome"),
            "summary": row["summary"],
            "payload": payload,
            "updated_at": row["updated_at"],
        }
