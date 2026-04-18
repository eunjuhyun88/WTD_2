from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def _git(cwd: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(cwd), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout.strip()


def _init_repo(tmp_path: Path) -> tuple[Path, Path]:
    repo = tmp_path / "repo"
    remote = tmp_path / "remote.git"
    repo.mkdir()
    _git(tmp_path, "init", "--bare", str(remote))
    _git(repo, "init")
    _git(repo, "config", "user.name", "Codex")
    _git(repo, "config", "user.email", "codex@example.com")
    _git(repo, "config", "commit.gpgsign", "false")
    _git(repo, "checkout", "-b", "main")
    (repo / "README.md").write_text("seed\n", encoding="utf-8")
    _git(repo, "add", "README.md")
    _git(repo, "commit", "-m", "seed")
    _git(repo, "remote", "add", "origin", str(remote))
    _git(repo, "push", "-u", "origin", "main")
    return repo, remote


def test_cli_session_lifecycle(tmp_path) -> None:
    root = Path(__file__).resolve().parents[1]
    db_path = tmp_path / "agent-control.sqlite"
    worktree = tmp_path / "wt-cli"
    worktree.mkdir()

    start = subprocess.run(
        [
            sys.executable,
            "-m",
            "ops.cli",
            "session",
            "start",
            "--db-path",
            str(db_path),
            "--repo-root",
            str(tmp_path),
            "--work-item",
            "W-0052",
            "--branch",
            "task/w-0052-cli",
            "--worktree",
            str(worktree),
            "--started-at",
            "2026-04-16T14:00:00+00:00",
            "--json",
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert start.returncode == 0, start.stderr
    started_payload = json.loads(start.stdout)
    session_id = started_payload["session"]["session_id"]

    heartbeat = subprocess.run(
        [
            sys.executable,
            "-m",
            "ops.cli",
            "session",
            "heartbeat",
            "--db-path",
            str(db_path),
            "--session",
            session_id,
            "--heartbeat-at",
            "2026-04-16T14:05:00+00:00",
            "--json",
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert heartbeat.returncode == 0, heartbeat.stderr
    assert json.loads(heartbeat.stdout)["session"]["last_heartbeat_at"] == "2026-04-16T14:05:00+00:00"

    handoff = subprocess.run(
        [
            sys.executable,
            "-m",
            "ops.cli",
            "session",
            "handoff",
            "--db-path",
            str(db_path),
            "--session",
            session_id,
            "--event",
            "verified",
            "--summary",
            "ops tests passed",
            "--created-at",
            "2026-04-16T14:06:00+00:00",
            "--json",
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert handoff.returncode == 0, handoff.stderr
    handoff_payload = json.loads(handoff.stdout)
    assert handoff_payload["event"]["event_kind"] == "verified"

    close = subprocess.run(
        [
            sys.executable,
            "-m",
            "ops.cli",
            "session",
            "close",
            "--db-path",
            str(db_path),
            "--session",
            session_id,
            "--closed-at",
            "2026-04-16T14:10:00+00:00",
            "--json",
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert close.returncode == 0, close.stderr
    assert json.loads(close.stdout)["session"]["status"] == "closed"


def test_cli_reconcile_scan_and_report(tmp_path) -> None:
    root = Path(__file__).resolve().parents[1]
    repo, _ = _init_repo(tmp_path)
    artifact_path = tmp_path / "agent-status.json"
    db_path = tmp_path / "agent-control.sqlite"

    scan = subprocess.run(
        [
            sys.executable,
            "-m",
            "ops.cli",
            "reconcile",
            "scan",
            "--db-path",
            str(db_path),
            "--repo-root",
            str(repo),
            "--artifact-path",
            str(artifact_path),
            "--generated-at",
            "2026-04-16T15:00:00+00:00",
            "--json",
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert scan.returncode == 0, scan.stderr
    scan_payload = json.loads(scan.stdout)
    assert artifact_path.exists()
    assert scan_payload["repo_root"] == str(repo.resolve())

    report = subprocess.run(
        [
            sys.executable,
            "-m",
            "ops.cli",
            "reconcile",
            "report",
            "--artifact-path",
            str(artifact_path),
            "--json",
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert report.returncode == 0, report.stderr
    report_payload = json.loads(report.stdout)
    assert report_payload["generated_at"] == "2026-04-16T15:00:00+00:00"
