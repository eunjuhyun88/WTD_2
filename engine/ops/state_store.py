from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path

from .models import AgentSession, BranchLease, HandoffEvent, WorkClaim

STATE_DIR = Path(__file__).resolve().parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "agent-control.sqlite"


class OpsStateError(RuntimeError):
    """Base error for agent control-plane state."""


class OpsStateConflictError(OpsStateError):
    """Raised when a session conflicts with existing ownership or leases."""


class OpsStateNotFoundError(OpsStateError):
    """Raised when a requested session does not exist."""


def _json_dumps(value: object) -> str:
    return json.dumps(value if value is not None else {}, sort_keys=True, separators=(",", ":"))


def _json_loads_dict(value: str | None) -> dict:
    if not value:
        return {}
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


class OpsStateStore:
    """SQLite WAL-backed session registry for multi-agent execution."""

    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS agent_sessions (
                  session_id TEXT PRIMARY KEY,
                  agent_name TEXT NOT NULL,
                  owner TEXT NOT NULL,
                  status TEXT NOT NULL,
                  metadata_json TEXT NOT NULL DEFAULT '{}',
                  started_at TEXT NOT NULL,
                  last_heartbeat_at TEXT NOT NULL,
                  closed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS work_claims (
                  session_id TEXT PRIMARY KEY,
                  work_item_ref TEXT NOT NULL,
                  claim_mode TEXT NOT NULL,
                  parent_session_id TEXT,
                  claimed_at TEXT NOT NULL,
                  released_at TEXT,
                  FOREIGN KEY(session_id) REFERENCES agent_sessions(session_id),
                  FOREIGN KEY(parent_session_id) REFERENCES agent_sessions(session_id)
                );

                CREATE TABLE IF NOT EXISTS branch_leases (
                  session_id TEXT PRIMARY KEY,
                  branch_name TEXT NOT NULL,
                  worktree_path TEXT NOT NULL,
                  lease_status TEXT NOT NULL,
                  claimed_at TEXT NOT NULL,
                  released_at TEXT,
                  FOREIGN KEY(session_id) REFERENCES agent_sessions(session_id)
                );

                CREATE TABLE IF NOT EXISTS handoff_events (
                  event_id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL,
                  event_kind TEXT NOT NULL,
                  summary TEXT NOT NULL,
                  details_json TEXT NOT NULL DEFAULT '{}',
                  created_at TEXT NOT NULL,
                  FOREIGN KEY(session_id) REFERENCES agent_sessions(session_id)
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_work_claim_primary_active
                  ON work_claims(work_item_ref)
                  WHERE released_at IS NULL AND claim_mode = 'primary';

                CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_leases_branch_active
                  ON branch_leases(branch_name)
                  WHERE released_at IS NULL;

                CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_leases_worktree_active
                  ON branch_leases(worktree_path)
                  WHERE released_at IS NULL;

                CREATE INDEX IF NOT EXISTS idx_work_claims_work_item
                  ON work_claims(work_item_ref, released_at);

                CREATE INDEX IF NOT EXISTS idx_branch_leases_branch
                  ON branch_leases(branch_name, released_at);

                CREATE INDEX IF NOT EXISTS idx_handoff_events_session
                  ON handoff_events(session_id, created_at DESC);
                """
            )

    def start_session(
        self,
        *,
        agent_name: str,
        owner: str,
        work_item_ref: str,
        branch_name: str,
        worktree_path: str | Path,
        started_at: str,
        claim_mode: str = "primary",
        parent_session_id: str | None = None,
        metadata: dict | None = None,
    ) -> AgentSession:
        session_id = str(uuid.uuid4())
        worktree = str(Path(worktree_path).resolve())
        with self._connect() as conn:
            self._assert_claim_is_available(
                conn,
                work_item_ref=work_item_ref,
                claim_mode=claim_mode,
                parent_session_id=parent_session_id,
            )
            self._assert_lease_is_available(conn, branch_name=branch_name, worktree_path=worktree)
            conn.execute(
                """
                INSERT INTO agent_sessions (
                  session_id, agent_name, owner, status, metadata_json,
                  started_at, last_heartbeat_at, closed_at
                ) VALUES (?, ?, ?, 'active', ?, ?, ?, NULL)
                """,
                (session_id, agent_name, owner, _json_dumps(metadata), started_at, started_at),
            )
            conn.execute(
                """
                INSERT INTO work_claims (
                  session_id, work_item_ref, claim_mode, parent_session_id, claimed_at, released_at
                ) VALUES (?, ?, ?, ?, ?, NULL)
                """,
                (session_id, work_item_ref, claim_mode, parent_session_id, started_at),
            )
            conn.execute(
                """
                INSERT INTO branch_leases (
                  session_id, branch_name, worktree_path, lease_status, claimed_at, released_at
                ) VALUES (?, ?, ?, 'active', ?, NULL)
                """,
                (session_id, branch_name, worktree, started_at),
            )
        session = self.get_session(session_id)
        assert session is not None
        return session

    def heartbeat_session(self, session_id: str, *, heartbeat_at: str) -> AgentSession:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT status FROM agent_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if row is None:
                raise OpsStateNotFoundError(f"session {session_id} was not found")
            if row["status"] == "closed":
                raise OpsStateConflictError(f"session {session_id} is already closed")
            conn.execute(
                """
                UPDATE agent_sessions
                SET last_heartbeat_at = ?
                WHERE session_id = ?
                """,
                (heartbeat_at, session_id),
            )
        session = self.get_session(session_id)
        assert session is not None
        return session

    def record_handoff_event(
        self,
        *,
        session_id: str,
        event_kind: str,
        summary: str,
        details: dict | None,
        created_at: str,
    ) -> HandoffEvent:
        event_id = str(uuid.uuid4())
        with self._connect() as conn:
            exists = conn.execute(
                "SELECT 1 FROM agent_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if exists is None:
                raise OpsStateNotFoundError(f"session {session_id} was not found")
            conn.execute(
                """
                INSERT INTO handoff_events (
                  event_id, session_id, event_kind, summary, details_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (event_id, session_id, event_kind, summary, _json_dumps(details), created_at),
            )
        event = self.list_handoff_events(session_id=session_id)[0]
        assert event.event_id == event_id
        return event

    def close_session(self, session_id: str, *, closed_at: str, final_status: str = "closed") -> AgentSession:
        with self._connect() as conn:
            exists = conn.execute(
                "SELECT 1 FROM agent_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            if exists is None:
                raise OpsStateNotFoundError(f"session {session_id} was not found")
            conn.execute(
                """
                UPDATE agent_sessions
                SET status = ?, last_heartbeat_at = ?, closed_at = ?
                WHERE session_id = ?
                """,
                (final_status, closed_at, closed_at, session_id),
            )
            conn.execute(
                """
                UPDATE work_claims
                SET released_at = COALESCE(released_at, ?)
                WHERE session_id = ?
                """,
                (closed_at, session_id),
            )
            conn.execute(
                """
                UPDATE branch_leases
                SET lease_status = 'released', released_at = COALESCE(released_at, ?)
                WHERE session_id = ?
                """,
                (closed_at, session_id),
            )
        session = self.get_session(session_id)
        assert session is not None
        return session

    def get_session(self, session_id: str) -> AgentSession | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM agent_sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        return _row_to_session(row) if row is not None else None

    def get_work_claim(self, session_id: str) -> WorkClaim | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM work_claims WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        return _row_to_claim(row) if row is not None else None

    def get_branch_lease(self, session_id: str) -> BranchLease | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM branch_leases WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        return _row_to_lease(row) if row is not None else None

    def get_session_bundle(self, session_id: str) -> dict | None:
        session = self.get_session(session_id)
        if session is None:
            return None
        claim = self.get_work_claim(session_id)
        lease = self.get_branch_lease(session_id)
        handoff_events = self.list_handoff_events(session_id=session_id)
        return {
            "session": session.to_dict(),
            "work_claim": claim.to_dict() if claim else None,
            "branch_lease": lease.to_dict() if lease else None,
            "handoff_events": [item.to_dict() for item in handoff_events],
        }

    def list_sessions(self, *, status: str | None = None) -> list[AgentSession]:
        query = "SELECT * FROM agent_sessions"
        params: tuple[str, ...] = ()
        if status is not None:
            query += " WHERE status = ?"
            params = (status,)
        query += " ORDER BY started_at DESC"
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [_row_to_session(row) for row in rows]

    def list_work_claims(self, *, active_only: bool = False) -> list[WorkClaim]:
        query = "SELECT * FROM work_claims"
        if active_only:
            query += " WHERE released_at IS NULL"
        query += " ORDER BY claimed_at DESC"
        with self._connect() as conn:
            rows = conn.execute(query).fetchall()
        return [_row_to_claim(row) for row in rows]

    def list_branch_leases(self, *, active_only: bool = False) -> list[BranchLease]:
        query = "SELECT * FROM branch_leases"
        if active_only:
            query += " WHERE released_at IS NULL"
        query += " ORDER BY claimed_at DESC"
        with self._connect() as conn:
            rows = conn.execute(query).fetchall()
        return [_row_to_lease(row) for row in rows]

    def list_handoff_events(self, *, session_id: str | None = None) -> list[HandoffEvent]:
        query = "SELECT * FROM handoff_events"
        params: tuple[str, ...] = ()
        if session_id is not None:
            query += " WHERE session_id = ?"
            params = (session_id,)
        query += " ORDER BY created_at DESC"
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [_row_to_handoff_event(row) for row in rows]

    def _assert_claim_is_available(
        self,
        conn: sqlite3.Connection,
        *,
        work_item_ref: str,
        claim_mode: str,
        parent_session_id: str | None,
    ) -> None:
        active_claims = conn.execute(
            """
            SELECT session_id, claim_mode, parent_session_id
            FROM work_claims
            WHERE work_item_ref = ? AND released_at IS NULL
            ORDER BY claimed_at ASC
            """,
            (work_item_ref,),
        ).fetchall()
        if claim_mode == "primary":
            if active_claims:
                raise OpsStateConflictError(f"work item {work_item_ref} already has an active claim")
            return
        if claim_mode != "parallel_child":
            raise OpsStateConflictError(f"unsupported claim_mode {claim_mode}")
        if not parent_session_id:
            raise OpsStateConflictError("parallel_child claims require parent_session_id")
        parent_claim = None
        for row in active_claims:
            if row["session_id"] == parent_session_id:
                parent_claim = row
                break
        if parent_claim is None:
            raise OpsStateConflictError(
                f"parallel parent {parent_session_id} must be an active claim on {work_item_ref}"
            )
        if parent_claim["claim_mode"] != "primary":
            raise OpsStateConflictError(
                f"parallel parent {parent_session_id} must hold the primary claim"
            )

    def _assert_lease_is_available(
        self,
        conn: sqlite3.Connection,
        *,
        branch_name: str,
        worktree_path: str,
    ) -> None:
        branch_row = conn.execute(
            """
            SELECT session_id FROM branch_leases
            WHERE branch_name = ? AND released_at IS NULL
            """,
            (branch_name,),
        ).fetchone()
        if branch_row is not None:
            raise OpsStateConflictError(f"branch {branch_name} already has an active lease")
        worktree_row = conn.execute(
            """
            SELECT session_id FROM branch_leases
            WHERE worktree_path = ? AND released_at IS NULL
            """,
            (worktree_path,),
        ).fetchone()
        if worktree_row is not None:
            raise OpsStateConflictError(f"worktree {worktree_path} already has an active lease")


def _row_to_session(row: sqlite3.Row) -> AgentSession:
    return AgentSession(
        session_id=row["session_id"],
        agent_name=row["agent_name"],
        owner=row["owner"],
        status=row["status"],
        started_at=row["started_at"],
        last_heartbeat_at=row["last_heartbeat_at"],
        closed_at=row["closed_at"],
        metadata=_json_loads_dict(row["metadata_json"]),
    )


def _row_to_claim(row: sqlite3.Row) -> WorkClaim:
    return WorkClaim(
        session_id=row["session_id"],
        work_item_ref=row["work_item_ref"],
        claim_mode=row["claim_mode"],
        parent_session_id=row["parent_session_id"],
        claimed_at=row["claimed_at"],
        released_at=row["released_at"],
    )


def _row_to_lease(row: sqlite3.Row) -> BranchLease:
    return BranchLease(
        session_id=row["session_id"],
        branch_name=row["branch_name"],
        worktree_path=row["worktree_path"],
        lease_status=row["lease_status"],
        claimed_at=row["claimed_at"],
        released_at=row["released_at"],
    )


def _row_to_handoff_event(row: sqlite3.Row) -> HandoffEvent:
    return HandoffEvent(
        event_id=row["event_id"],
        session_id=row["session_id"],
        event_kind=row["event_kind"],
        summary=row["summary"],
        details=_json_loads_dict(row["details_json"]),
        created_at=row["created_at"],
    )
