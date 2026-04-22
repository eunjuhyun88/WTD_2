# W-0052 Multi-Agent Execution Control Plane

## Goal

Design the CTO-level execution control plane that lets multiple AI agents work in parallel with explicit ownership, durable state, merge-safe handoff, and automated cleanup/reconciliation instead of relying on ad-hoc branch/worktree discipline.

## Owner

contract

## Scope

- define the canonical state model for parallel agent execution across work items, branches, worktrees, PRs, and merge gates
- define how agent sessions are claimed, heartbeated, handed off, blocked, and closed
- define the reconciliation model that detects dirty worktrees, orphaned branches, stacked-PR drift, merged-but-not-cleaned branches, and work-item mismatches
- define the first CLI/runtime surface for session registration, inspection, merge gating, and cleanup suggestions
- keep the control plane repo-native and durable so agents can resume from files and state rows instead of chat residue

## Non-Goals

- implementing a full app-web UI in this slice
- replacing GitHub or git as the underlying version-control system
- making `app/` the source of truth for backend or orchestration state
- introducing speculative autonomous merge behavior without explicit gate rules

## Canonical Files

- `AGENTS.md`
- `work/active/W-0052-multi-agent-execution-control-plane.md`
- `work/active/W-0022-guardrail-import-and-multi-agent-governance.md`
- `work/active/W-0031-agent-context-and-design-governance.md`
- `work/active/W-0048-refinement-policy-and-reporting.md`
- `work/active/W-0049-refinement-operator-control-plane.md`
- `docs/domains/refinement-operator-control-plane.md`

## Facts

- the repo already enforces policy-level branch/worktree discipline in `AGENTS.md`, but enforcement is procedural rather than durable
- the current repository can accumulate many simultaneous worktrees and branches, while ownership, merge status, and cleanup state remain implicit
- the refinement runtime now has a working pattern for durable control-plane state: `research_run` + report artifacts + operator control separation
- recent work showed that stacked PRs and parallel agent branches can be merged safely only when base/ownership/reconciliation are made explicit
- current failure mode is not lack of agent output; it is lack of a shared execution state plane that records who owns what, what is blocked, and what is safe to merge or delete

## Assumptions

- durable CLI-first control is enough for Phase 1; app-web can consume generated state later
- one work item should remain the default merge unit even if multiple agents contribute in parallel
- fail-closed behavior is preferable: uncertain ownership or merge state should block or warn rather than auto-advance

## Open Questions

- whether agent approval and cleanup actions should live in the same SQLite store as execution sessions or in adjacent stores
- whether GitHub PR metadata should be pulled live every scan or cached into local state with explicit refresh timestamps
- whether future agent runtime orchestration should reuse this same control plane or only the development/merge plane

## Decisions

- the execution control plane should use `engine/` as the backend truth, following the same durable-state pattern as refinement control
- git branches and worktrees are execution artifacts, not the canonical coordination state; the canonical state is the session/lease/gate store
- the default execution unit remains `one work item -> one merge unit -> one primary branch/worktree`, with parallel work allowed only through explicit leases or stacked-PR parent/child relationships
- multi-agent coordination should be modeled as control-plane entities, not as prompt conventions
- reconciliation is a first-class system function: every scan must classify dirty worktrees, stale sessions, merged branches, branch/work-item mismatches, missing PRs, and blocked merge gates
- automation rollout should be staged: observe -> warn -> enforce -> cleanup
- the most efficient AI-agent operating model for this repo is `single merge-unit ownership by default, explicit parallel child leases when needed, CLI-first durable control, and report-driven reconciliation`
- branch split reason: the root worktree currently contains unrelated terminal/refinement/chart-range changes, so W-0052 implementation must proceed on a clean `origin/main`-based worktree and branch

## Design Principles

1. Control-plane first
   - agent coordination should be persisted before it is automated

2. Merge-unit ownership
   - the unit of coordination is not "files touched"
   - the unit is `work item + branch lease + PR`

3. Fail closed
   - unknown ownership, stale sessions, dirty merge units, or drifted stacked PRs should block or warn

4. Low-friction agent UX
   - the happy path must be 2-3 short commands, not a long manual checklist

5. CLI before UI
   - agent and operator usage should work from terminal first; UI is a later projection

6. Resume from durable state
   - a new agent should reconstruct work from session rows, handoff events, and generated reports, not from chat

## Proposed State Model

- `agent_session`
  - `session_id`
  - `agent_id`
  - `started_at`
  - `heartbeat_at`
  - `status` (`active`, `idle`, `blocked`, `stale`, `closed`)
  - `work_item_id`
  - `owner`
  - `change_type`
  - `branch`
  - `worktree_path`
  - `base_branch`
  - `parent_session_id`

- `work_claim`
  - `work_item_id`
  - `claimed_by_session_id`
  - `claim_mode` (`exclusive`, `parallel_child`, `observer`)
  - `granted_at`
  - `released_at`
  - `parallel_reason`

- `branch_lease`
  - `branch`
  - `worktree_path`
  - `work_item_id`
  - `session_id`
  - `lease_status` (`active`, `released`, `merged`, `orphaned`)
  - `upstream`
  - `pr_number`

- `handoff_event`
  - `handoff_id`
  - `session_id`
  - `event_kind` (`design_ready`, `impl_ready`, `verified`, `pr_opened`, `pr_merged`, `cleanup_done`, `blocked`)
  - `detail`
  - `recorded_at`

- `merge_gate`
  - `branch`
  - `gate_status` (`clear`, `warn`, `blocked`)
  - `dirty_worktree`
  - `work_item_match`
  - `verification_passed`
  - `pr_present`
  - `base_divergence`
  - `merge_conflict_risk`
  - `evaluated_at`
  - `blockers`

- `cleanup_candidate`
  - `kind` (`local_branch`, `remote_branch`, `worktree`, `runtime_artifact`)
  - `target`
  - `reason`
  - `safe_after`
  - `linked_pr`
  - `linked_session_id`

## Control-Plane Flow

```text
agent start
  -> register session
  -> claim work item
  -> create or attach branch lease
  -> heartbeat while active
  -> write handoff events as milestones complete
  -> reconcile scans derive merge gate + cleanup candidates
  -> PR open / update
  -> PR merge
  -> cleanup candidate promoted to safe delete
  -> close session
```

Design rule:

- agents do not “just work on a branch”
- agents operate inside a registered session with a durable lease and visible merge state

## Required Reconciliation Checks

Every scan should classify at least these conditions:

1. dirty worktree
   - tracked or untracked changes exist

2. work-item mismatch
   - session claims `W-xxxx` but branch/worktree/files clearly belong elsewhere

3. missing upstream
   - local branch has no upstream and is not marked local-only

4. merged-but-not-cleaned
   - PR merged but local/remote branch and worktree still present

5. stale session
   - no heartbeat within TTL

6. stacked PR drift
   - child PR base has been squash-merged or rebased such that child branch is now dirty against `main`

7. branch collision
   - more than one active session claims the same merge unit without explicit `parallel_child` relationship

8. unsafe main
   - local `main` diverged from `origin/main` or is being used as an active execution branch

## CLI Surfaces

Phase 1 should be CLI-first.

- `agent-session start --work-item W-0052 --branch ... --worktree ...`
- `agent-session heartbeat --session ...`
- `agent-session handoff --session ... --event verified`
- `agent-session close --session ...`
- `agent-reconcile scan`
- `agent-reconcile report`
- `agent-cleanup-candidates list`
- `agent-cleanup-candidates apply --kind local_branch --target ...`

Output should be both:

- human-readable table/markdown
- machine-readable JSON artifacts under `docs/generated/ops/` or engine runtime state

## Implementation Plan

### Phase 1: Session Registry MVP

Goal:

- make active agent ownership explicit and queryable

Deliverables:

- `engine/ops/models.py`
- `engine/ops/state_store.py`
- `engine/ops/__init__.py`
- `scripts/ops/agent-session`

Required entities in this phase:

- `agent_session`
- `work_claim`
- `branch_lease`
- `handoff_event`

Required commands:

- `agent-session start`
- `agent-session heartbeat`
- `agent-session handoff`
- `agent-session close`
- `agent-session show`

Verification target:

- targeted engine tests for SQLite create/update/list flows
- command smoke tests for start -> heartbeat -> handoff -> close

Success condition:

- no active execution branch exists without a session row and branch lease

### Phase 2: Reconcile and Report

Goal:

- detect repo state drift automatically and make it inspectable

Deliverables:

- `engine/ops/reconcile.py`
- `engine/ops/reporting.py`
- `scripts/ops/agent-reconcile`
- `docs/generated/ops/agent-status.json`
- `docs/generated/ops/agent-status.md`

Required checks in this phase:

- dirty worktree
- missing upstream
- merged-but-not-cleaned
- stale session
- work-item mismatch
- unsafe main

Verification target:

- fixture-based reconcile tests over sample git states
- report snapshot tests for JSON/markdown output

Success condition:

- one `agent-reconcile scan` run can explain current dirty/unsafe states without manual git archaeology

### Phase 3: Merge Gate and Stacked PR Safety

Goal:

- make PR-readiness explicit and stop stacked-PR drift from silently breaking merges

Deliverables:

- `engine/ops/github_sync.py`
- `engine/ops/merge_gate.py`
- `scripts/ops/agent-merge-gate`

Required checks in this phase:

- PR exists
- verification recorded
- base divergence
- stacked PR drift after squash merge
- branch collision across active sessions

Verification target:

- tests that simulate parent PR squash merge and verify child branch gets flagged
- tests that derive `clear`, `warn`, `blocked` gate states from controlled fixtures

Success condition:

- no PR is recommended as mergeable when ownership or base lineage is ambiguous

### Phase 4: Safe Cleanup Automation

Goal:

- remove merged/stale execution artifacts without losing active work

Deliverables:

- `engine/ops/cleanup.py`
- `scripts/ops/agent-cleanup-candidates`
- `scripts/ops/agent-cleanup-apply`

Cleanup scopes:

- local merged branches
- remote merged branches
- stale worktrees
- runtime artifacts such as generated `ledger_records` outside active claims

Verification target:

- cleanup candidate derivation tests
- dry-run apply tests
- explicit safety tests ensuring dirty worktrees are never auto-removed

Success condition:

- merged execution branches and stale worktrees stop accumulating by default

## File Plan

Engine backend truth:

- `engine/ops/models.py`
- `engine/ops/state_store.py`
- `engine/ops/reconcile.py`
- `engine/ops/reporting.py`
- `engine/ops/github_sync.py`
- `engine/ops/merge_gate.py`
- `engine/ops/cleanup.py`

CLI wrappers:

- `scripts/ops/agent-session`
- `scripts/ops/agent-reconcile`
- `scripts/ops/agent-merge-gate`
- `scripts/ops/agent-cleanup-candidates`
- `scripts/ops/agent-cleanup-apply`

Generated read surfaces:

- `docs/generated/ops/agent-status.json`
- `docs/generated/ops/agent-status.md`

## Operator Views

Minimum views the control plane must produce:

1. active sessions
   - `session_id`, `agent_id`, `work_item_id`, `branch`, `worktree_path`, `heartbeat_age`

2. merge blockers
   - branch, work item, blocker list, verification state, PR state

3. cleanup candidates
   - target, reason, grace period, linked PR/session

4. stale or unsafe execution state
   - stale sessions
   - dirty worktrees
   - diverged `main`
   - merged branches still leased

## Success Metrics

- active execution branches without a registered session: `0`
- merged PR branches left unclassified for cleanup beyond grace period: `0`
- stale sessions without visible warning: `0`
- manual time required to answer "who owns this branch/worktree?": under `30s`
- manual time required to answer "is this safe to merge/delete?": under `30s`

## Risks and Mitigations

- risk: the control plane becomes heavier than the work
  - mitigation: Phase 1 is CLI-first and observe-only

- risk: git/GitHub state is partially unavailable during scans
  - mitigation: record last refresh time and degrade to `warn`, not false `clear`

- risk: agents bypass the CLI and keep using raw git
  - mitigation: Phase 2 reconciliation explicitly flags unregistered execution branches

- risk: cleanup automation deletes active work
  - mitigation: cleanup stays opt-in and fail-closed until Phase 4 confidence is proven

## Merge Gate Policy

Minimum gate for `mergeable=true`:

- one active session owns the merge unit
- work item and branch lease match
- worktree is clean
- verification target recorded and passed
- PR exists
- no unresolved stacked-PR drift
- no unknown dirty sibling worktree holding the same merge unit

If any of these fail:

- `gate_status = blocked`
- explicit `blockers[]` emitted

## Automation Rollout

### Phase 1: Observe

- record sessions, leases, heartbeats, handoff events
- generate reconciliation reports
- no hard blocking

### Phase 2: Warn

- warn on branch/work-item mismatch, missing upstream, stale session, merged-but-not-cleaned branch
- mark merge gate `warn`/`blocked`

### Phase 3: Enforce

- block new sessions from claiming already-owned merge units without explicit parallel mode
- block cleanup if worktree still dirty
- block merge recommendation when gate is not clear

### Phase 4: Safe Cleanup

- suggest deletion of merged local branches, remote branches, stale worktrees, and runtime artifacts after grace period
- optional auto-clean only for explicitly safe categories

## Relationship To Existing Control Planes

- W-0048 style methodology control plane proves the durable-state pattern
- W-0049 style operator control plane proves approval/inspection/guardrail separation
- W-0052 applies the same ideas to development execution:
  - methodology plane equivalent: agent execution state
  - operator plane equivalent: merge/cleanup approval and inspection

Design rule:

- what `research_run` is to refinement execution,
  `agent_session` should be to multi-agent development execution

## Recommended Implementation Order

1. implement Phase 1 session registry with `agent-session` CLI and targeted tests
2. implement Phase 2 reconcile/report layer and make it runnable against the current repo
3. implement Phase 3 merge-gate evaluation, especially stacked-PR drift detection
4. implement Phase 4 cleanup candidates in dry-run mode only
5. only after the dry-run reports are trusted should cleanup or merge blocking become automatic

## Exit Criteria

- a durable design exists for multi-agent execution coordination
- the design makes branch/worktree state a projection rather than the source of truth
- a future implementation can detect and classify the exact failure modes currently seen in this repo
- the rollout path is staged enough to start in observe-only mode and tighten later
- the plan identifies concrete files, CLI surfaces, verification targets, and success metrics for a first implementation slice

## Handoff Checklist

- this document is the implementation plan source for the first multi-agent execution slice
- implementation should start in `engine/ops/` rather than `app/`
- the first slice should be Phase 1 session registry plus minimal CLI
- cleanup automation must remain opt-in until reconcile quality is proven
