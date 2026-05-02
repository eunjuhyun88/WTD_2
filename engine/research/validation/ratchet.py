"""Git ratchet — autoresearch cycles commit only forward."""
from __future__ import annotations

import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml

_RULES_PATH = Path("engine/research/rules/active.yaml")
_AUTORESEARCH_BRANCH_PREFIX = "autoresearch/cycle-"


@dataclass
class CycleResult:
    """Result of a single autoresearch cycle."""

    cycle_id: int
    status: str
    commit_sha: Optional[str] = None
    reject_reason: Optional[str] = None
    cost_usd: float = 0.0
    latency_sec: float = 0.0
    candidates_proposed: int = 0
    candidates_after_l2: int = 0
    dsr_delta: Optional[float] = None


class Ratchet:
    """Git ratchet for atomic cycle commits."""

    def __init__(self, cycle_id: int, sandbox: bool = True) -> None:
        self.cycle_id = cycle_id
        self.sandbox = sandbox
        self.branch = f"{_AUTORESEARCH_BRANCH_PREFIX}{cycle_id}"
        self.start_time = datetime.now(timezone.utc)

    def checkout_cycle_branch(self) -> None:
        """Create autoresearch/cycle-N from current main."""
        subprocess.run(
            ["git", "checkout", "-b", self.branch],
            check=True,
            capture_output=True,
        )

    def read_rules(self) -> dict:
        """Read current active.yaml rules."""
        with _RULES_PATH.open() as f:
            return yaml.safe_load(f)

    def write_rules(self, new_rules: dict) -> None:
        """Write new rules to active.yaml."""
        with _RULES_PATH.open("w") as f:
            yaml.safe_dump(new_rules, f, sort_keys=False)

    def commit(self, diff_summary: str) -> str:
        """Commit rules change atomically."""
        msg = f"autoresearch cycle {self.cycle_id}: {diff_summary}"
        subprocess.run(
            ["git", "add", str(_RULES_PATH)],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", msg],
            check=True,
            capture_output=True,
        )
        sha = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        return sha

    def reset(self) -> None:
        """Reset changes and delete cycle branch."""
        subprocess.run(
            ["git", "reset", "--hard", "HEAD~1"],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "checkout", "main"],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "branch", "-D", self.branch],
            check=True,
            capture_output=True,
        )

    def success(
        self,
        best_proposal,
        commit_sha: str,
        candidates_after_l2: int,
    ) -> CycleResult:
        """Record successful cycle."""
        latency_sec = (
            datetime.now(timezone.utc) - self.start_time
        ).total_seconds()

        return CycleResult(
            cycle_id=self.cycle_id,
            status="committed",
            commit_sha=commit_sha,
            candidates_after_l2=candidates_after_l2,
            dsr_delta=best_proposal.dsr_delta,
            latency_sec=latency_sec,
        )

    def reject(self, reason: str, cost_usd: float = 0.0) -> CycleResult:
        """Reject cycle and reset."""
        self.reset()
        latency_sec = (
            datetime.now(timezone.utc) - self.start_time
        ).total_seconds()

        return CycleResult(
            cycle_id=self.cycle_id,
            status="rejected",
            reject_reason=reason,
            cost_usd=cost_usd,
            latency_sec=latency_sec,
        )

    def error(self, exception: Exception, cost_usd: float = 0.0) -> CycleResult:
        """Handle error and reset."""
        self.reset()
        latency_sec = (
            datetime.now(timezone.utc) - self.start_time
        ).total_seconds()

        return CycleResult(
            cycle_id=self.cycle_id,
            status="error",
            reject_reason=str(exception),
            cost_usd=cost_usd,
            latency_sec=latency_sec,
        )
