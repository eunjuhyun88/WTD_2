"""Durable worker-control state for refinement methodology runs.

`ResearchRun` is intentionally separate from pattern evidence and from
`training_run` ledger records. It captures the control-plane lifecycle of a
bounded search/evaluation campaign before any candidate is handed off to the
training lane.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

ResearchRunStatus = Literal["pending", "running", "completed", "failed", "cancelled"]
ResearchDisposition = Literal["no_op", "dead_end", "train_candidate"]
SelectionDecisionKind = Literal["advance", "reject", "dead_end", "train_candidate"]
OperatorDecisionKind = Literal["approve", "defer", "reject"]
ResearchMemoryKind = Literal[
    "breakthrough",
    "rejected_hypothesis",
    "dead_end",
    "flat_landscape",
    "assumption_update",
]

STATE_DIR = Path(__file__).resolve().parent / "state"
DEFAULT_DB_PATH = STATE_DIR / "research_runtime.sqlite"
_UNSET = object()


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


def _json_loads_list(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


@dataclass(frozen=True)
class ResearchRun:
    research_run_id: str
    pattern_slug: str
    objective_id: str
    baseline_ref: str
    search_policy: dict
    evaluation_protocol: dict
    status: ResearchRunStatus
    completion_disposition: ResearchDisposition | None
    winner_variant_ref: str | None
    handoff_payload: dict
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None


@dataclass(frozen=True)
class SelectionDecision:
    research_run_id: str
    selected_variant_ref: str | None
    decision_kind: SelectionDecisionKind
    rationale: str
    baseline_ref: str
    metrics: dict
    decided_at: str


@dataclass(frozen=True)
class ResearchMemoryNote:
    memory_id: str
    research_run_id: str
    pattern_slug: str
    note_kind: ResearchMemoryKind
    summary: str
    detail: str | None
    tags: list[str]
    created_at: str


@dataclass(frozen=True)
class OperatorDecision:
    research_run_id: str
    decision: OperatorDecisionKind
    decided_by: str
    rationale: str
    decided_at: str


@dataclass(frozen=True)
class PatternControlState:
    pattern_slug: str
    enabled: bool
    paused_by_policy: bool
    paused_by_operator: bool
    approval_required: bool
    auto_train_allowed: bool
    cooldown_until: str | None
    pause_reason: str | None
    updated_at: str


class ResearchStateStore:
    """SQLite WAL-backed store for methodology-owned refinement state."""

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
                CREATE TABLE IF NOT EXISTS research_runs (
                  research_run_id TEXT PRIMARY KEY,
                  pattern_slug TEXT NOT NULL,
                  objective_id TEXT NOT NULL,
                  baseline_ref TEXT NOT NULL,
                  search_policy_json TEXT NOT NULL,
                  evaluation_protocol_json TEXT NOT NULL,
                  status TEXT NOT NULL,
                  completion_disposition TEXT,
                  winner_variant_ref TEXT,
                  handoff_payload_json TEXT NOT NULL DEFAULT '{}',
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  started_at TEXT,
                  completed_at TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_research_runs_pattern_status
                  ON research_runs(pattern_slug, status, updated_at DESC);

                CREATE TABLE IF NOT EXISTS research_selection_decisions (
                  research_run_id TEXT PRIMARY KEY,
                  selected_variant_ref TEXT,
                  decision_kind TEXT NOT NULL,
                  rationale TEXT NOT NULL,
                  baseline_ref TEXT NOT NULL,
                  metrics_json TEXT NOT NULL DEFAULT '{}',
                  decided_at TEXT NOT NULL,
                  FOREIGN KEY(research_run_id) REFERENCES research_runs(research_run_id)
                );

                CREATE TABLE IF NOT EXISTS research_memory_notes (
                  memory_id TEXT PRIMARY KEY,
                  research_run_id TEXT NOT NULL,
                  pattern_slug TEXT NOT NULL,
                  note_kind TEXT NOT NULL,
                  summary TEXT NOT NULL,
                  detail TEXT,
                  tags_json TEXT NOT NULL DEFAULT '[]',
                  created_at TEXT NOT NULL,
                  FOREIGN KEY(research_run_id) REFERENCES research_runs(research_run_id)
                );

                CREATE INDEX IF NOT EXISTS idx_research_memory_pattern_kind
                  ON research_memory_notes(pattern_slug, note_kind, created_at DESC);

                CREATE TABLE IF NOT EXISTS research_operator_decisions (
                  research_run_id TEXT PRIMARY KEY,
                  decision TEXT NOT NULL,
                  decided_by TEXT NOT NULL,
                  rationale TEXT NOT NULL,
                  decided_at TEXT NOT NULL,
                  FOREIGN KEY(research_run_id) REFERENCES research_runs(research_run_id)
                );

                CREATE TABLE IF NOT EXISTS research_pattern_controls (
                  pattern_slug TEXT PRIMARY KEY,
                  enabled INTEGER NOT NULL DEFAULT 1,
                  paused_by_policy INTEGER NOT NULL DEFAULT 0,
                  paused_by_operator INTEGER NOT NULL DEFAULT 0,
                  approval_required INTEGER NOT NULL DEFAULT 1,
                  auto_train_allowed INTEGER NOT NULL DEFAULT 0,
                  cooldown_until TEXT,
                  pause_reason TEXT,
                  updated_at TEXT NOT NULL
                );
                """
            )

    def create_run(
        self,
        *,
        pattern_slug: str,
        objective_id: str,
        baseline_ref: str,
        search_policy: dict,
        evaluation_protocol: dict,
        created_at: str,
    ) -> ResearchRun:
        research_run_id = str(uuid.uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO research_runs (
                  research_run_id, pattern_slug, objective_id, baseline_ref,
                  search_policy_json, evaluation_protocol_json, status,
                  completion_disposition, winner_variant_ref, handoff_payload_json,
                  created_at, updated_at, started_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, '{}', ?, ?, NULL, NULL)
                """,
                (
                    research_run_id,
                    pattern_slug,
                    objective_id,
                    baseline_ref,
                    _json_dumps(search_policy),
                    _json_dumps(evaluation_protocol),
                    created_at,
                    created_at,
                ),
            )
        run = self.get_run(research_run_id)
        assert run is not None
        return run

    def start_run(self, research_run_id: str, *, started_at: str) -> ResearchRun:
        self._update_run_state(
            research_run_id,
            status="running",
            updated_at=started_at,
            started_at=started_at,
        )
        run = self.get_run(research_run_id)
        assert run is not None
        return run

    def complete_run(
        self,
        research_run_id: str,
        *,
        completed_at: str,
        disposition: ResearchDisposition,
        winner_variant_ref: str | None = None,
        handoff_payload: dict | None = None,
    ) -> ResearchRun:
        self._update_run_state(
            research_run_id,
            status="completed",
            updated_at=completed_at,
            completed_at=completed_at,
            completion_disposition=disposition,
            winner_variant_ref=winner_variant_ref,
            handoff_payload=handoff_payload or {},
        )
        run = self.get_run(research_run_id)
        assert run is not None
        return run

    def fail_run(
        self,
        research_run_id: str,
        *,
        completed_at: str,
        error: str,
    ) -> ResearchRun:
        self._update_run_state(
            research_run_id,
            status="failed",
            updated_at=completed_at,
            completed_at=completed_at,
            handoff_payload={"error": error},
        )
        run = self.get_run(research_run_id)
        assert run is not None
        return run

    def record_selection_decision(
        self,
        *,
        research_run_id: str,
        selected_variant_ref: str | None,
        decision_kind: SelectionDecisionKind,
        rationale: str,
        baseline_ref: str,
        metrics: dict | None,
        decided_at: str,
    ) -> SelectionDecision:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO research_selection_decisions (
                  research_run_id, selected_variant_ref, decision_kind, rationale,
                  baseline_ref, metrics_json, decided_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(research_run_id) DO UPDATE SET
                  selected_variant_ref = excluded.selected_variant_ref,
                  decision_kind = excluded.decision_kind,
                  rationale = excluded.rationale,
                  baseline_ref = excluded.baseline_ref,
                  metrics_json = excluded.metrics_json,
                  decided_at = excluded.decided_at
                """,
                (
                    research_run_id,
                    selected_variant_ref,
                    decision_kind,
                    rationale,
                    baseline_ref,
                    _json_dumps(metrics or {}),
                    decided_at,
                ),
            )
        decision = self.get_selection_decision(research_run_id)
        assert decision is not None
        return decision

    def append_memory_note(
        self,
        *,
        research_run_id: str,
        pattern_slug: str,
        note_kind: ResearchMemoryKind,
        summary: str,
        detail: str | None,
        tags: list[str] | None,
        created_at: str,
    ) -> ResearchMemoryNote:
        memory_id = str(uuid.uuid4())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO research_memory_notes (
                  memory_id, research_run_id, pattern_slug, note_kind, summary, detail, tags_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    memory_id,
                    research_run_id,
                    pattern_slug,
                    note_kind,
                    summary,
                    detail,
                    json.dumps(tags or []),
                    created_at,
                ),
            )
        note = self.get_memory_note(memory_id)
        assert note is not None
        return note

    def get_run(self, research_run_id: str) -> ResearchRun | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM research_runs WHERE research_run_id = ?",
                (research_run_id,),
            ).fetchone()
        return self._row_to_run(row) if row else None

    def update_handoff_payload(self, research_run_id: str, *, payload: dict, updated_at: str) -> ResearchRun:
        current = self.get_run(research_run_id)
        if current is None:
            raise KeyError(f"Research run not found: {research_run_id}")
        merged = dict(current.handoff_payload)
        merged.update(payload)
        self._update_run_state(
            research_run_id,
            status=current.status,
            updated_at=updated_at,
            handoff_payload=merged,
        )
        run = self.get_run(research_run_id)
        assert run is not None
        return run

    def list_runs(
        self,
        *,
        pattern_slug: str | None = None,
        status: ResearchRunStatus | None = None,
        limit: int = 20,
    ) -> list[ResearchRun]:
        query = ["SELECT * FROM research_runs WHERE 1=1"]
        params: list[object] = []
        if pattern_slug:
            query.append("AND pattern_slug = ?")
            params.append(pattern_slug)
        if status:
            query.append("AND status = ?")
            params.append(status)
        query.append("ORDER BY updated_at DESC")
        query.append("LIMIT ?")
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(" ".join(query), tuple(params)).fetchall()
        return [self._row_to_run(row) for row in rows]

    def get_selection_decision(self, research_run_id: str) -> SelectionDecision | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM research_selection_decisions WHERE research_run_id = ?",
                (research_run_id,),
            ).fetchone()
        if row is None:
            return None
        return SelectionDecision(
            research_run_id=row["research_run_id"],
            selected_variant_ref=row["selected_variant_ref"],
            decision_kind=row["decision_kind"],
            rationale=row["rationale"],
            baseline_ref=row["baseline_ref"],
            metrics=_json_loads_dict(row["metrics_json"]),
            decided_at=row["decided_at"],
        )

    def get_memory_note(self, memory_id: str) -> ResearchMemoryNote | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM research_memory_notes WHERE memory_id = ?",
                (memory_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_memory_note(row)

    def record_operator_decision(
        self,
        *,
        research_run_id: str,
        decision: OperatorDecisionKind,
        decided_by: str,
        rationale: str,
        decided_at: str,
    ) -> OperatorDecision:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO research_operator_decisions (
                  research_run_id, decision, decided_by, rationale, decided_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(research_run_id) DO UPDATE SET
                  decision = excluded.decision,
                  decided_by = excluded.decided_by,
                  rationale = excluded.rationale,
                  decided_at = excluded.decided_at
                """,
                (
                    research_run_id,
                    decision,
                    decided_by,
                    rationale,
                    decided_at,
                ),
            )
        result = self.get_operator_decision(research_run_id)
        assert result is not None
        return result

    def get_operator_decision(self, research_run_id: str) -> OperatorDecision | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM research_operator_decisions WHERE research_run_id = ?",
                (research_run_id,),
            ).fetchone()
        if row is None:
            return None
        return OperatorDecision(
            research_run_id=row["research_run_id"],
            decision=row["decision"],
            decided_by=row["decided_by"],
            rationale=row["rationale"],
            decided_at=row["decided_at"],
        )

    def upsert_pattern_control_state(
        self,
        pattern_slug: str,
        *,
        updated_at: str,
        enabled: bool | None = None,
        paused_by_policy: bool | None = None,
        paused_by_operator: bool | None = None,
        approval_required: bool | None = None,
        auto_train_allowed: bool | None = None,
        cooldown_until: object = _UNSET,
        pause_reason: object = _UNSET,
    ) -> PatternControlState:
        current = self.get_pattern_control_state(pattern_slug)
        merged = PatternControlState(
            pattern_slug=pattern_slug,
            enabled=current.enabled if enabled is None else enabled,
            paused_by_policy=current.paused_by_policy if paused_by_policy is None else paused_by_policy,
            paused_by_operator=current.paused_by_operator if paused_by_operator is None else paused_by_operator,
            approval_required=current.approval_required if approval_required is None else approval_required,
            auto_train_allowed=current.auto_train_allowed if auto_train_allowed is None else auto_train_allowed,
            cooldown_until=current.cooldown_until if cooldown_until is _UNSET else cooldown_until,  # type: ignore[arg-type]
            pause_reason=current.pause_reason if pause_reason is _UNSET else pause_reason,  # type: ignore[arg-type]
            updated_at=updated_at,
        )
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO research_pattern_controls (
                  pattern_slug, enabled, paused_by_policy, paused_by_operator,
                  approval_required, auto_train_allowed, cooldown_until, pause_reason, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(pattern_slug) DO UPDATE SET
                  enabled = excluded.enabled,
                  paused_by_policy = excluded.paused_by_policy,
                  paused_by_operator = excluded.paused_by_operator,
                  approval_required = excluded.approval_required,
                  auto_train_allowed = excluded.auto_train_allowed,
                  cooldown_until = excluded.cooldown_until,
                  pause_reason = excluded.pause_reason,
                  updated_at = excluded.updated_at
                """,
                (
                    merged.pattern_slug,
                    1 if merged.enabled else 0,
                    1 if merged.paused_by_policy else 0,
                    1 if merged.paused_by_operator else 0,
                    1 if merged.approval_required else 0,
                    1 if merged.auto_train_allowed else 0,
                    merged.cooldown_until,
                    merged.pause_reason,
                    merged.updated_at,
                ),
            )
        result = self.get_pattern_control_state(pattern_slug)
        assert result is not None
        return result

    def get_pattern_control_state(self, pattern_slug: str) -> PatternControlState:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM research_pattern_controls WHERE pattern_slug = ?",
                (pattern_slug,),
            ).fetchone()
        if row is None:
            return PatternControlState(
                pattern_slug=pattern_slug,
                enabled=True,
                paused_by_policy=False,
                paused_by_operator=False,
                approval_required=True,
                auto_train_allowed=False,
                cooldown_until=None,
                pause_reason=None,
                updated_at="",
            )
        return PatternControlState(
            pattern_slug=row["pattern_slug"],
            enabled=bool(row["enabled"]),
            paused_by_policy=bool(row["paused_by_policy"]),
            paused_by_operator=bool(row["paused_by_operator"]),
            approval_required=bool(row["approval_required"]),
            auto_train_allowed=bool(row["auto_train_allowed"]),
            cooldown_until=row["cooldown_until"],
            pause_reason=row["pause_reason"],
            updated_at=row["updated_at"],
        )

    def list_pattern_control_states(self, *, limit: int = 50) -> list[PatternControlState]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM research_pattern_controls ORDER BY updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [
            PatternControlState(
                pattern_slug=row["pattern_slug"],
                enabled=bool(row["enabled"]),
                paused_by_policy=bool(row["paused_by_policy"]),
                paused_by_operator=bool(row["paused_by_operator"]),
                approval_required=bool(row["approval_required"]),
                auto_train_allowed=bool(row["auto_train_allowed"]),
                cooldown_until=row["cooldown_until"],
                pause_reason=row["pause_reason"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]

    def list_memory_notes(
        self,
        *,
        pattern_slug: str | None = None,
        research_run_id: str | None = None,
        note_kind: ResearchMemoryKind | None = None,
        limit: int = 20,
    ) -> list[ResearchMemoryNote]:
        query = ["SELECT * FROM research_memory_notes WHERE 1=1"]
        params: list[object] = []
        if pattern_slug:
            query.append("AND pattern_slug = ?")
            params.append(pattern_slug)
        if research_run_id:
            query.append("AND research_run_id = ?")
            params.append(research_run_id)
        if note_kind:
            query.append("AND note_kind = ?")
            params.append(note_kind)
        query.append("ORDER BY created_at DESC")
        query.append("LIMIT ?")
        params.append(limit)
        with self._connect() as conn:
            rows = conn.execute(" ".join(query), tuple(params)).fetchall()
        return [self._row_to_memory_note(row) for row in rows]

    def _update_run_state(
        self,
        research_run_id: str,
        *,
        status: ResearchRunStatus,
        updated_at: str,
        started_at: str | None = None,
        completed_at: str | None = None,
        completion_disposition: ResearchDisposition | None = None,
        winner_variant_ref: str | None = None,
        handoff_payload: dict | None = None,
    ) -> None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT started_at, completed_at, completion_disposition, winner_variant_ref, handoff_payload_json
                FROM research_runs
                WHERE research_run_id = ?
                """,
                (research_run_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Research run not found: {research_run_id}")
            conn.execute(
                """
                UPDATE research_runs
                SET status = ?,
                    updated_at = ?,
                    started_at = COALESCE(?, started_at),
                    completed_at = COALESCE(?, completed_at),
                    completion_disposition = COALESCE(?, completion_disposition),
                    winner_variant_ref = COALESCE(?, winner_variant_ref),
                    handoff_payload_json = ?
                WHERE research_run_id = ?
                """,
                (
                    status,
                    updated_at,
                    started_at,
                    completed_at,
                    completion_disposition,
                    winner_variant_ref,
                    _json_dumps(handoff_payload) if handoff_payload is not None else row["handoff_payload_json"],
                    research_run_id,
                ),
            )

    def _row_to_run(self, row: sqlite3.Row) -> ResearchRun:
        return ResearchRun(
            research_run_id=row["research_run_id"],
            pattern_slug=row["pattern_slug"],
            objective_id=row["objective_id"],
            baseline_ref=row["baseline_ref"],
            search_policy=_json_loads_dict(row["search_policy_json"]),
            evaluation_protocol=_json_loads_dict(row["evaluation_protocol_json"]),
            status=row["status"],
            completion_disposition=row["completion_disposition"],
            winner_variant_ref=row["winner_variant_ref"],
            handoff_payload=_json_loads_dict(row["handoff_payload_json"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            started_at=row["started_at"],
            completed_at=row["completed_at"],
        )

    def _row_to_memory_note(self, row: sqlite3.Row) -> ResearchMemoryNote:
        return ResearchMemoryNote(
            memory_id=row["memory_id"],
            research_run_id=row["research_run_id"],
            pattern_slug=row["pattern_slug"],
            note_kind=row["note_kind"],
            summary=row["summary"],
            detail=row["detail"],
            tags=_json_loads_list(row["tags_json"]),
            created_at=row["created_at"],
        )
