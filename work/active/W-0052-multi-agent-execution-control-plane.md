# W-0052 Multi-Agent Execution Control Plane

## Goal

Implement the Phase 1 multi-agent execution control plane so active agent ownership, branch/worktree leases, handoff events, and repo-state reconciliation become durable and inspectable instead of living only in git state and chat context.

## Owner

engine

## Scope

- add a SQLite-backed agent session registry under `engine/ops/`
- persist `agent_session`, `work_claim`, `branch_lease`, and `handoff_event`
- add a repo-local reconciliation pass that detects dirty worktrees, missing upstreams, stale sessions, merged-but-not-cleaned branches, unsafe `main`, and work-item mismatches
- add CLI-first entrypoints for `agent-session` and `agent-reconcile`
- emit one machine-readable JSON artifact for reconcile output

## Non-Goals

- app-web UI
- GitHub PR mutation or sync
- merge blocking enforcement
- automatic cleanup application

## Canonical Files

- `AGENTS.md`
- `work/active/W-0052-multi-agent-execution-control-plane.md`
- `docs/domains/multi-agent-execution-control-plane.md`
- `engine/ops/models.py`
- `engine/ops/state_store.py`
- `engine/ops/reconcile.py`
- `engine/ops/cli.py`
- `scripts/ops/agent-session`
- `scripts/ops/agent-reconcile`

## Facts

- the root worktree currently contains unrelated terminal/refinement/chart-range changes, so this slice must stay on a clean `origin/main`-based worktree
- the repo already has a working pattern for durable SQLite-backed control-plane state in `engine/research/state_store.py`
- current multi-agent failure mode is coordination drift: dirty worktrees, unregistered branches, merged-but-not-cleaned branches, and ambiguous ownership
- Phase 1 only needs local git/worktree truth; GitHub API dependency is not required
- one JSON artifact is enough for the first read-only inspection surface

## Assumptions

- `engine/` is the backend truth for this control plane
- CLI ergonomics matter more than UI in Phase 1

## Open Questions

- none for Phase 1

## Decisions

- the runtime artifact path will be `engine/ops/state/agent-status.json`
- the SQLite state path will be `engine/ops/state/agent-control.sqlite`
- CLI wrappers will live in `scripts/ops/` and call `python -m ops.cli ...`
- `agent-session start` may auto-detect branch/worktree when omitted, but explicit arguments remain supported
- cleanup is reported as `cleanup_candidate` only; no mutation commands are part of this slice
- each session holds one active `work_claim` and one active `branch_lease`; parallel work is modeled as an explicit `parallel_child` claim
- reconcile auto-detects the base ref as `origin/main` first, then local `main` as fallback

## Next Steps

1. Review the Phase 1 operator output against the current repo's real multi-worktree state.
2. Split any follow-up enforcement or cleanup automation into a separate work item.

## Exit Criteria

- agent sessions, claims, leases, and handoff events persist durably
- reconcile output explains the current repo state without manual git archaeology
- CLI flows `start -> heartbeat -> handoff -> close` and `scan -> report` are covered by tests

## Handoff Checklist

- active branch: `codex/w-0052-agent-execution-control-plane`
- active worktree: `/private/tmp/wtd-v2-w0052-agent-control-plane`
- verification target: `uv run pytest tests/test_ops_state_store.py tests/test_ops_reconcile.py tests/test_ops_cli.py`
- verification status: passed on 2026-04-16
- this slice is Phase 1 only; GitHub sync, merge gates, and cleanup automation stay out
