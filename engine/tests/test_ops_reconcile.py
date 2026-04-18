from __future__ import annotations

import subprocess
from pathlib import Path

from ops.reconcile import scan_repo
from ops.state_store import OpsStateStore


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


def test_reconcile_reports_dirty_missing_upstream_and_unregistered_worktree(tmp_path) -> None:
    repo, _ = _init_repo(tmp_path)
    worktree = tmp_path / "wt-dirty"
    _git(repo, "branch", "task/w-0052-dirty", "main")
    _git(repo, "worktree", "add", str(worktree), "task/w-0052-dirty")
    (worktree / "notes.txt").write_text("dirty\n", encoding="utf-8")

    report = scan_repo(
        repo,
        db_path=tmp_path / "agent-control.sqlite",
        artifact_path=tmp_path / "agent-status.json",
        generated_at="2026-04-16T13:00:00+00:00",
    )
    codes = {issue.code for issue in report.issues}
    assert "dirty_worktree" in codes
    assert "missing_upstream" in codes
    assert "unregistered_worktree" in codes


def test_reconcile_reports_stale_session(tmp_path) -> None:
    repo, _ = _init_repo(tmp_path)
    worktree = tmp_path / "wt-stale"
    _git(repo, "branch", "task/w-0052-stale", "main")
    _git(repo, "worktree", "add", str(worktree), "task/w-0052-stale")

    store = OpsStateStore(tmp_path / "agent-control.sqlite")
    store.start_session(
        agent_name="codex",
        owner="engine",
        work_item_ref="W-0052",
        branch_name="task/w-0052-stale",
        worktree_path=worktree,
        started_at="2026-04-16T10:00:00+00:00",
    )

    report = scan_repo(
        repo,
        store=store,
        artifact_path=tmp_path / "agent-status.json",
        generated_at="2026-04-16T13:00:00+00:00",
        stale_after_seconds=60,
    )
    codes = {issue.code for issue in report.issues}
    assert "stale_session" in codes


def test_reconcile_reports_merged_branch_cleanup_candidates(tmp_path) -> None:
    repo, _ = _init_repo(tmp_path)
    _git(repo, "checkout", "-b", "task/w-0052-merged")
    (repo / "merged.txt").write_text("merged branch\n", encoding="utf-8")
    _git(repo, "add", "merged.txt")
    _git(repo, "commit", "-m", "branch commit")
    _git(repo, "checkout", "main")
    _git(repo, "merge", "--no-ff", "task/w-0052-merged", "-m", "merge branch")
    _git(repo, "push", "origin", "main")

    report = scan_repo(
        repo,
        db_path=tmp_path / "agent-control.sqlite",
        artifact_path=tmp_path / "agent-status.json",
        generated_at="2026-04-16T13:00:00+00:00",
    )
    codes = {issue.code for issue in report.issues}
    branch_candidates = [item for item in report.cleanup_candidates if item.candidate_kind == "branch"]
    assert "merged_but_not_cleaned" in codes
    assert any(item.branch_name == "task/w-0052-merged" for item in branch_candidates)


def test_reconcile_reports_local_main_divergence(tmp_path) -> None:
    repo, _ = _init_repo(tmp_path)
    (repo / "local-main.txt").write_text("ahead\n", encoding="utf-8")
    _git(repo, "add", "local-main.txt")
    _git(repo, "commit", "-m", "local ahead")

    report = scan_repo(
        repo,
        db_path=tmp_path / "agent-control.sqlite",
        artifact_path=tmp_path / "agent-status.json",
        generated_at="2026-04-16T13:00:00+00:00",
    )
    codes = {issue.code for issue in report.issues}
    assert "unsafe_main" in codes


def test_reconcile_reports_work_item_mismatch(tmp_path) -> None:
    repo, _ = _init_repo(tmp_path)
    worktree = tmp_path / "wt-mismatch"
    _git(repo, "branch", "task/w-0099-mismatch", "main")
    _git(repo, "worktree", "add", str(worktree), "task/w-0099-mismatch")

    store = OpsStateStore(tmp_path / "agent-control.sqlite")
    store.start_session(
        agent_name="codex",
        owner="engine",
        work_item_ref="W-0052",
        branch_name="task/w-0099-mismatch",
        worktree_path=worktree,
        started_at="2026-04-16T10:00:00+00:00",
    )

    report = scan_repo(
        repo,
        store=store,
        artifact_path=tmp_path / "agent-status.json",
        generated_at="2026-04-16T13:00:00+00:00",
    )
    codes = {issue.code for issue in report.issues}
    assert "work_item_mismatch" in codes

