from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

SessionStatus = Literal["active", "blocked", "closed"]
ClaimMode = Literal["primary", "parallel_child"]
LeaseStatus = Literal["active", "released"]
HandoffEventKind = Literal[
    "design_ready",
    "impl_ready",
    "verified",
    "pr_opened",
    "pr_merged",
    "cleanup_done",
    "blocked",
]
IssueSeverity = Literal["info", "warn", "blocked"]
CleanupCandidateKind = Literal["branch", "worktree"]


@dataclass(frozen=True)
class AgentSession:
    session_id: str
    agent_name: str
    owner: str
    status: SessionStatus
    started_at: str
    last_heartbeat_at: str
    closed_at: str | None
    metadata: dict

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class WorkClaim:
    session_id: str
    work_item_ref: str
    claim_mode: ClaimMode
    parent_session_id: str | None
    claimed_at: str
    released_at: str | None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class BranchLease:
    session_id: str
    branch_name: str
    worktree_path: str
    lease_status: LeaseStatus
    claimed_at: str
    released_at: str | None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class HandoffEvent:
    event_id: str
    session_id: str
    event_kind: HandoffEventKind
    summary: str
    details: dict
    created_at: str

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class ReconcileIssue:
    issue_id: str
    severity: IssueSeverity
    code: str
    message: str
    branch_name: str | None
    worktree_path: str | None
    session_id: str | None
    work_item_ref: str | None
    details: dict

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class CleanupCandidate:
    candidate_id: str
    candidate_kind: CleanupCandidateKind
    branch_name: str | None
    worktree_path: str | None
    reason: str
    safe_to_remove: bool
    details: dict

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class AgentStatusReport:
    generated_at: str
    repo_root: str
    base_ref: str | None
    active_sessions: list[AgentSession]
    active_claims: list[WorkClaim]
    active_leases: list[BranchLease]
    issues: list[ReconcileIssue]
    cleanup_candidates: list[CleanupCandidate]

    def to_dict(self) -> dict:
        return {
            "generated_at": self.generated_at,
            "repo_root": self.repo_root,
            "base_ref": self.base_ref,
            "active_sessions": [item.to_dict() for item in self.active_sessions],
            "active_claims": [item.to_dict() for item in self.active_claims],
            "active_leases": [item.to_dict() for item in self.active_leases],
            "issues": [item.to_dict() for item in self.issues],
            "cleanup_candidates": [item.to_dict() for item in self.cleanup_candidates],
        }

