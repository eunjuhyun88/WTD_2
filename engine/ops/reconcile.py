from __future__ import annotations

import json
import re
import subprocess
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .models import AgentStatusReport, CleanupCandidate, ReconcileIssue
from .state_store import DEFAULT_DB_PATH, OpsStateStore

STATE_DIR = Path(__file__).resolve().parent / "state"
DEFAULT_ARTIFACT_PATH = STATE_DIR / "agent-status.json"
DEFAULT_STALE_AFTER_SECONDS = 60 * 60
WORK_ITEM_PATTERN = re.compile(r"(?:^|[^0-9a-z])(w[-_]?(\d{4,}))", re.IGNORECASE)


@dataclass(frozen=True)
class GitWorktreeState:
    path: str
    branch_name: str | None
    upstream_name: str | None
    is_dirty: bool


def scan_repo(
    repo_root: Path | str,
    *,
    store: OpsStateStore | None = None,
    db_path: Path | str = DEFAULT_DB_PATH,
    artifact_path: Path | str = DEFAULT_ARTIFACT_PATH,
    generated_at: str | None = None,
    stale_after_seconds: int = DEFAULT_STALE_AFTER_SECONDS,
    base_ref: str | None = None,
) -> AgentStatusReport:
    repo_root_path = Path(repo_root).resolve()
    generated_at = generated_at or _utcnow()
    store = store or OpsStateStore(db_path)
    base_ref = base_ref or _resolve_base_ref(repo_root_path)
    active_sessions = [item for item in store.list_sessions() if item.status != "closed"]
    active_claims = store.list_work_claims(active_only=True)
    active_leases = store.list_branch_leases(active_only=True)
    worktrees = list_git_worktrees(repo_root_path)
    worktree_by_branch = {item.branch_name: item for item in worktrees if item.branch_name}
    worktree_by_path = {item.path: item for item in worktrees}
    issues: list[ReconcileIssue] = []
    cleanup_candidates: list[CleanupCandidate] = []

    branch_leases = {item.branch_name: item for item in active_leases}
    worktree_leases = {item.worktree_path: item for item in active_leases}
    claim_by_session = {item.session_id: item for item in active_claims}

    for session in active_sessions:
        if _is_stale(session.last_heartbeat_at, generated_at, stale_after_seconds):
            claim = claim_by_session.get(session.session_id)
            lease = next((item for item in active_leases if item.session_id == session.session_id), None)
            issues.append(
                _issue(
                    severity="warn",
                    code="stale_session",
                    message=f"session {session.session_id} heartbeat is stale",
                    session_id=session.session_id,
                    work_item_ref=claim.work_item_ref if claim else None,
                    branch_name=lease.branch_name if lease else None,
                    worktree_path=lease.worktree_path if lease else None,
                    details={
                        "last_heartbeat_at": session.last_heartbeat_at,
                        "stale_after_seconds": stale_after_seconds,
                    },
                )
            )

    for worktree in worktrees:
        if worktree.is_dirty:
            lease = worktree_leases.get(worktree.path)
            claim = claim_by_session.get(lease.session_id) if lease else None
            issues.append(
                _issue(
                    severity="warn",
                    code="dirty_worktree",
                    message=f"worktree {worktree.path} has uncommitted changes",
                    session_id=lease.session_id if lease else None,
                    work_item_ref=claim.work_item_ref if claim else None,
                    branch_name=worktree.branch_name,
                    worktree_path=worktree.path,
                    details={"upstream_name": worktree.upstream_name},
                )
            )
        if worktree.branch_name and worktree.upstream_name is None:
            lease = branch_leases.get(worktree.branch_name)
            claim = claim_by_session.get(lease.session_id) if lease else None
            issues.append(
                _issue(
                    severity="warn",
                    code="missing_upstream",
                    message=f"branch {worktree.branch_name} has no upstream",
                    session_id=lease.session_id if lease else None,
                    work_item_ref=claim.work_item_ref if claim else None,
                    branch_name=worktree.branch_name,
                    worktree_path=worktree.path,
                    details={},
                )
            )

    for worktree in worktrees:
        if not worktree.branch_name or worktree.branch_name == "main":
            continue
        if worktree.branch_name not in branch_leases and worktree.path not in worktree_leases:
            issues.append(
                _issue(
                    severity="warn",
                    code="unregistered_worktree",
                    message=f"worktree {worktree.path} is active but not registered in the control plane",
                    branch_name=worktree.branch_name,
                    worktree_path=worktree.path,
                    session_id=None,
                    work_item_ref=None,
                    details={},
                )
            )

    _append_claim_collision_issues(issues, active_claims, active_leases)

    for claim in active_claims:
        lease = next((item for item in active_leases if item.session_id == claim.session_id), None)
        if lease is None:
            continue
        expected = normalize_work_item_key(claim.work_item_ref)
        actual = normalize_work_item_key(lease.branch_name)
        if expected and actual and expected != actual:
            issues.append(
                _issue(
                    severity="warn",
                    code="work_item_mismatch",
                    message=f"claim {claim.work_item_ref} does not match branch {lease.branch_name}",
                    session_id=claim.session_id,
                    work_item_ref=claim.work_item_ref,
                    branch_name=lease.branch_name,
                    worktree_path=lease.worktree_path,
                    details={"expected": expected, "actual": actual},
                )
            )

    if base_ref:
        main_divergence = _branch_divergence(repo_root_path, "main", base_ref)
        if main_divergence and (main_divergence["ahead"] or main_divergence["behind"]):
            issues.append(
                _issue(
                    severity="blocked",
                    code="unsafe_main",
                    message="local main diverges from the configured base ref",
                    branch_name="main",
                    worktree_path=worktree_by_branch["main"].path if "main" in worktree_by_branch else None,
                    session_id=None,
                    work_item_ref=None,
                    details=main_divergence,
                )
            )
    if "main" in branch_leases:
        lease = branch_leases["main"]
        claim = claim_by_session.get(lease.session_id)
        issues.append(
            _issue(
                severity="blocked",
                code="unsafe_main_session",
                message="an active session is leasing main",
                session_id=lease.session_id,
                work_item_ref=claim.work_item_ref if claim else None,
                branch_name="main",
                worktree_path=lease.worktree_path,
                details={},
            )
        )

    for branch_name in list_local_branches(repo_root_path):
        if branch_name == "main":
            continue
        if not base_ref or not _is_branch_merged(repo_root_path, branch_name, base_ref):
            continue
        lease = branch_leases.get(branch_name)
        worktree = worktree_by_branch.get(branch_name)
        safe_to_remove = lease is None and worktree is None
        cleanup_candidates.append(
            _cleanup_candidate(
                candidate_kind="branch",
                branch_name=branch_name,
                worktree_path=worktree.path if worktree else None,
                reason="branch is already merged into base ref",
                safe_to_remove=safe_to_remove,
                details={"base_ref": base_ref},
            )
        )
        if worktree is not None:
            cleanup_candidates.append(
                _cleanup_candidate(
                    candidate_kind="worktree",
                    branch_name=branch_name,
                    worktree_path=worktree.path,
                    reason="worktree still points at a merged branch",
                    safe_to_remove=lease is None,
                    details={"base_ref": base_ref},
                )
            )
        issues.append(
            _issue(
                severity="warn",
                code="merged_but_not_cleaned",
                message=f"branch {branch_name} is merged but still present locally",
                session_id=lease.session_id if lease else None,
                work_item_ref=claim_by_session.get(lease.session_id).work_item_ref if lease and lease.session_id in claim_by_session else None,
                branch_name=branch_name,
                worktree_path=worktree.path if worktree else None,
                details={"base_ref": base_ref},
            )
        )

    report = AgentStatusReport(
        generated_at=generated_at,
        repo_root=str(repo_root_path),
        base_ref=base_ref,
        active_sessions=active_sessions,
        active_claims=active_claims,
        active_leases=active_leases,
        issues=issues,
        cleanup_candidates=cleanup_candidates,
    )
    artifact_path = Path(artifact_path)
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True), encoding="utf-8")
    return report


def read_report(artifact_path: Path | str = DEFAULT_ARTIFACT_PATH) -> dict:
    path = Path(artifact_path)
    if not path.exists():
        raise FileNotFoundError(f"report artifact {path} does not exist")
    return json.loads(path.read_text(encoding="utf-8"))


def format_report(report: AgentStatusReport | dict) -> str:
    data = report.to_dict() if isinstance(report, AgentStatusReport) else report
    lines = [
        f"generated_at: {data['generated_at']}",
        f"repo_root: {data['repo_root']}",
        f"base_ref: {data.get('base_ref') or '-'}",
        f"active_sessions: {len(data.get('active_sessions', []))}",
        f"active_claims: {len(data.get('active_claims', []))}",
        f"active_leases: {len(data.get('active_leases', []))}",
        f"issues: {len(data.get('issues', []))}",
        f"cleanup_candidates: {len(data.get('cleanup_candidates', []))}",
    ]
    for issue in data.get("issues", [])[:10]:
        lines.append(
            f"- [{issue['severity']}] {issue['code']}: {issue['message']}"
        )
    if len(data.get("issues", [])) > 10:
        lines.append(f"- ... {len(data['issues']) - 10} more issues")
    return "\n".join(lines)


def list_git_worktrees(repo_root: Path | str) -> list[GitWorktreeState]:
    repo_root = Path(repo_root)
    output = _git_stdout(repo_root, "worktree", "list", "--porcelain")
    records: list[dict[str, str]] = []
    current: dict[str, str] = {}
    for line in output.splitlines():
        if not line.strip():
            if current:
                records.append(current)
                current = {}
            continue
        key, _, value = line.partition(" ")
        current[key] = value
    if current:
        records.append(current)

    worktrees: list[GitWorktreeState] = []
    for record in records:
        path = str(Path(record["worktree"]).resolve())
        branch_ref = record.get("branch")
        branch_name = branch_ref.removeprefix("refs/heads/") if branch_ref else None
        upstream_name = _git_optional_stdout(Path(path), "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")
        status_output = _git_stdout(Path(path), "status", "--porcelain")
        worktrees.append(
            GitWorktreeState(
                path=path,
                branch_name=branch_name,
                upstream_name=upstream_name.strip() or None if upstream_name else None,
                is_dirty=bool(status_output.strip()),
            )
        )
    return worktrees


def list_local_branches(repo_root: Path | str) -> list[str]:
    output = _git_stdout(Path(repo_root), "for-each-ref", "--format=%(refname:short)", "refs/heads")
    return [line.strip() for line in output.splitlines() if line.strip()]


def normalize_work_item_key(value: str | None) -> str | None:
    if not value:
        return None
    match = WORK_ITEM_PATTERN.search(value.lower())
    if not match:
        return None
    return f"W-{int(match.group(2)):04d}"


def _append_claim_collision_issues(
    issues: list[ReconcileIssue],
    active_claims: list,
    active_leases: list,
) -> None:
    leases_by_session = {item.session_id: item for item in active_leases}
    grouped: dict[str, list] = {}
    for claim in active_claims:
        grouped.setdefault(claim.work_item_ref, []).append(claim)
    for work_item_ref, claims in grouped.items():
        primary_claims = [item for item in claims if item.claim_mode == "primary"]
        parallel_claims = [item for item in claims if item.claim_mode == "parallel_child"]
        if len(primary_claims) > 1:
            for claim in primary_claims:
                lease = leases_by_session.get(claim.session_id)
                issues.append(
                    _issue(
                        severity="blocked",
                        code="claim_collision",
                        message=f"work item {work_item_ref} has multiple primary claims",
                        session_id=claim.session_id,
                        work_item_ref=work_item_ref,
                        branch_name=lease.branch_name if lease else None,
                        worktree_path=lease.worktree_path if lease else None,
                        details={"primary_session_ids": [item.session_id for item in primary_claims]},
                    )
                )
        if primary_claims:
            primary_session_id = primary_claims[0].session_id
            for claim in parallel_claims:
                if claim.parent_session_id != primary_session_id:
                    lease = leases_by_session.get(claim.session_id)
                    issues.append(
                        _issue(
                            severity="blocked",
                            code="claim_collision",
                            message=f"parallel claim on {work_item_ref} does not point at the primary session",
                            session_id=claim.session_id,
                            work_item_ref=work_item_ref,
                            branch_name=lease.branch_name if lease else None,
                            worktree_path=lease.worktree_path if lease else None,
                            details={
                                "expected_parent_session_id": primary_session_id,
                                "actual_parent_session_id": claim.parent_session_id,
                            },
                        )
                    )


def _resolve_base_ref(repo_root: Path) -> str | None:
    if _git_exit_code(repo_root, "show-ref", "--verify", "--quiet", "refs/remotes/origin/main") == 0:
        return "origin/main"
    if _git_exit_code(repo_root, "show-ref", "--verify", "--quiet", "refs/heads/main") == 0:
        return "main"
    return None


def _is_branch_merged(repo_root: Path, branch_name: str, base_ref: str) -> bool:
    return _git_exit_code(repo_root, "merge-base", "--is-ancestor", branch_name, base_ref) == 0


def _branch_divergence(repo_root: Path, branch_name: str, base_ref: str) -> dict[str, int] | None:
    if _git_exit_code(repo_root, "show-ref", "--verify", "--quiet", f"refs/heads/{branch_name}") != 0:
        return None
    if _git_exit_code(repo_root, "rev-parse", "--verify", "--quiet", base_ref) != 0:
        return None
    output = _git_stdout(repo_root, "rev-list", "--left-right", "--count", f"{branch_name}...{base_ref}")
    left, right = output.strip().split()
    return {"ahead": int(left), "behind": int(right)}


def _issue(
    *,
    severity: str,
    code: str,
    message: str,
    branch_name: str | None = None,
    worktree_path: str | None = None,
    session_id: str | None = None,
    work_item_ref: str | None = None,
    details: dict | None = None,
) -> ReconcileIssue:
    return ReconcileIssue(
        issue_id=str(uuid.uuid4()),
        severity=severity,
        code=code,
        message=message,
        branch_name=branch_name,
        worktree_path=worktree_path,
        session_id=session_id,
        work_item_ref=work_item_ref,
        details=details or {},
    )


def _cleanup_candidate(
    *,
    candidate_kind: str,
    branch_name: str | None,
    worktree_path: str | None,
    reason: str,
    safe_to_remove: bool,
    details: dict | None = None,
) -> CleanupCandidate:
    return CleanupCandidate(
        candidate_id=str(uuid.uuid4()),
        candidate_kind=candidate_kind,
        branch_name=branch_name,
        worktree_path=worktree_path,
        reason=reason,
        safe_to_remove=safe_to_remove,
        details=details or {},
    )


def _is_stale(last_heartbeat_at: str, generated_at: str, stale_after_seconds: int) -> bool:
    last_seen = _parse_timestamp(last_heartbeat_at)
    generated = _parse_timestamp(generated_at)
    return (generated - last_seen).total_seconds() > stale_after_seconds


def _parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _git_stdout(repo_root: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def _git_optional_stdout(repo_root: Path, *args: str) -> str | None:
    proc = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return None
    return proc.stdout.strip()


def _git_exit_code(repo_root: Path, *args: str) -> int:
    proc = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    return proc.returncode

