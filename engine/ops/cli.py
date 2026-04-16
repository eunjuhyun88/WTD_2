from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from .reconcile import DEFAULT_ARTIFACT_PATH, DEFAULT_STALE_AFTER_SECONDS, format_report, read_report, scan_repo
from .state_store import DEFAULT_DB_PATH, OpsStateConflictError, OpsStateNotFoundError, OpsStateStore

REPO_ROOT = Path(__file__).resolve().parents[2]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_branch(repo_root: Path, branch_name: str | None) -> str:
    if branch_name:
        return branch_name
    import subprocess

    proc = subprocess.run(
        ["git", "-C", str(repo_root), "branch", "--show-current"],
        capture_output=True,
        text=True,
        check=False,
    )
    value = proc.stdout.strip()
    if proc.returncode != 0 or not value:
        raise RuntimeError("could not auto-detect the current branch; pass --branch")
    return value


def _resolve_worktree(repo_root: Path, worktree_path: str | None) -> str:
    return str(Path(worktree_path).resolve()) if worktree_path else str(repo_root.resolve())


def _build_session_payload(store: OpsStateStore, session_id: str) -> dict:
    bundle = store.get_session_bundle(session_id)
    if bundle is None:
        raise OpsStateNotFoundError(f"session {session_id} was not found")
    return bundle


def _print_payload(payload: object, *, as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return
    if isinstance(payload, dict) and {"session", "work_claim", "branch_lease"} <= set(payload.keys()):
        session = payload["session"]
        claim = payload["work_claim"]
        lease = payload["branch_lease"]
        print(f"session_id: {session['session_id']}")
        print(f"agent_name: {session['agent_name']}")
        print(f"owner: {session['owner']}")
        print(f"status: {session['status']}")
        print(f"work_item: {claim['work_item_ref'] if claim else '-'}")
        print(f"branch: {lease['branch_name'] if lease else '-'}")
        print(f"worktree: {lease['worktree_path'] if lease else '-'}")
        print(f"handoff_events: {len(payload['handoff_events'])}")
        return
    print(json.dumps(payload, indent=2, sort_keys=True))


def _run_session_start(args: argparse.Namespace) -> int:
    repo_root = Path(args.repo_root).resolve()
    store = OpsStateStore(args.db_path)
    branch_name = _resolve_branch(repo_root, args.branch)
    worktree_path = _resolve_worktree(repo_root, args.worktree)
    session = store.start_session(
        agent_name=args.agent_name,
        owner=args.owner,
        work_item_ref=args.work_item,
        branch_name=branch_name,
        worktree_path=worktree_path,
        started_at=args.started_at or _now(),
        claim_mode=args.claim_mode,
        parent_session_id=args.parent_session,
        metadata={"repo_root": str(repo_root), "note": args.note} if args.note else {"repo_root": str(repo_root)},
    )
    _print_payload(_build_session_payload(store, session.session_id), as_json=args.json)
    return 0


def _run_session_heartbeat(args: argparse.Namespace) -> int:
    store = OpsStateStore(args.db_path)
    session = store.heartbeat_session(args.session, heartbeat_at=args.heartbeat_at or _now())
    _print_payload(_build_session_payload(store, session.session_id), as_json=args.json)
    return 0


def _run_session_handoff(args: argparse.Namespace) -> int:
    store = OpsStateStore(args.db_path)
    event = store.record_handoff_event(
        session_id=args.session,
        event_kind=args.event,
        summary=args.summary,
        details={"details": args.details} if args.details else {},
        created_at=args.created_at or _now(),
    )
    payload = {
        "event": event.to_dict(),
        "session": _build_session_payload(store, args.session),
    }
    _print_payload(payload, as_json=args.json)
    return 0


def _run_session_close(args: argparse.Namespace) -> int:
    store = OpsStateStore(args.db_path)
    session = store.close_session(args.session, closed_at=args.closed_at or _now(), final_status=args.final_status)
    _print_payload(_build_session_payload(store, session.session_id), as_json=args.json)
    return 0


def _run_session_show(args: argparse.Namespace) -> int:
    store = OpsStateStore(args.db_path)
    if args.session:
        _print_payload(_build_session_payload(store, args.session), as_json=args.json)
        return 0
    sessions = [store.get_session_bundle(item.session_id) for item in store.list_sessions()]
    payload = [item for item in sessions if item is not None]
    _print_payload(payload, as_json=True if args.json else True)
    return 0


def _run_reconcile_scan(args: argparse.Namespace) -> int:
    report = scan_repo(
        args.repo_root,
        db_path=args.db_path,
        artifact_path=args.artifact_path,
        generated_at=args.generated_at,
        stale_after_seconds=args.stale_after_seconds,
        base_ref=args.base_ref,
    )
    if args.json:
        print(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    else:
        print(format_report(report))
    return 0


def _run_reconcile_report(args: argparse.Namespace) -> int:
    payload = read_report(args.artifact_path)
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(format_report(payload))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="WTD v2 ops CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    session_p = sub.add_parser("session", help="Manage multi-agent sessions")
    session_sub = session_p.add_subparsers(dest="session_command", required=True)

    start_p = session_sub.add_parser("start", help="Start one registered agent session")
    _add_store_args(start_p)
    start_p.add_argument("--repo-root", default=str(REPO_ROOT))
    start_p.add_argument("--agent-name", default=os.environ.get("CODEX_AGENT_NAME", "codex"))
    start_p.add_argument("--owner", default="engine")
    start_p.add_argument("--work-item", required=True)
    start_p.add_argument("--branch")
    start_p.add_argument("--worktree")
    start_p.add_argument("--claim-mode", choices=["primary", "parallel_child"], default="primary")
    start_p.add_argument("--parent-session")
    start_p.add_argument("--note")
    start_p.add_argument("--started-at")
    start_p.add_argument("--json", action="store_true")
    start_p.set_defaults(func=_run_session_start)

    heartbeat_p = session_sub.add_parser("heartbeat", help="Refresh one active session heartbeat")
    _add_store_args(heartbeat_p)
    heartbeat_p.add_argument("--session", required=True)
    heartbeat_p.add_argument("--heartbeat-at")
    heartbeat_p.add_argument("--json", action="store_true")
    heartbeat_p.set_defaults(func=_run_session_heartbeat)

    handoff_p = session_sub.add_parser("handoff", help="Record one handoff event")
    _add_store_args(handoff_p)
    handoff_p.add_argument("--session", required=True)
    handoff_p.add_argument("--event", required=True)
    handoff_p.add_argument("--summary", required=True)
    handoff_p.add_argument("--details")
    handoff_p.add_argument("--created-at")
    handoff_p.add_argument("--json", action="store_true")
    handoff_p.set_defaults(func=_run_session_handoff)

    close_p = session_sub.add_parser("close", help="Close one registered session")
    _add_store_args(close_p)
    close_p.add_argument("--session", required=True)
    close_p.add_argument("--closed-at")
    close_p.add_argument("--final-status", choices=["closed", "blocked"], default="closed")
    close_p.add_argument("--json", action="store_true")
    close_p.set_defaults(func=_run_session_close)

    show_p = session_sub.add_parser("show", help="Show session state")
    _add_store_args(show_p)
    show_p.add_argument("--session")
    show_p.add_argument("--json", action="store_true")
    show_p.set_defaults(func=_run_session_show)

    reconcile_p = sub.add_parser("reconcile", help="Scan and report repo drift")
    reconcile_sub = reconcile_p.add_subparsers(dest="reconcile_command", required=True)

    scan_p = reconcile_sub.add_parser("scan", help="Run reconcile and refresh the report artifact")
    _add_store_args(scan_p)
    _add_reconcile_args(scan_p)
    scan_p.add_argument("--json", action="store_true")
    scan_p.set_defaults(func=_run_reconcile_scan)

    report_p = reconcile_sub.add_parser("report", help="Print the last reconcile artifact")
    report_p.add_argument("--artifact-path", default=str(DEFAULT_ARTIFACT_PATH))
    report_p.add_argument("--json", action="store_true")
    report_p.set_defaults(func=_run_reconcile_report)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.func(args))
    except (OpsStateConflictError, OpsStateNotFoundError, FileNotFoundError, RuntimeError) as exc:
        print(json.dumps({"error": exc.__class__.__name__, "message": str(exc)}, indent=2))
        return 1


def _add_store_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH))


def _add_reconcile_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--repo-root", default=str(REPO_ROOT))
    parser.add_argument("--artifact-path", default=str(DEFAULT_ARTIFACT_PATH))
    parser.add_argument("--generated-at")
    parser.add_argument("--stale-after-seconds", type=int, default=DEFAULT_STALE_AFTER_SECONDS)
    parser.add_argument("--base-ref")


if __name__ == "__main__":
    raise SystemExit(main())

