# Domain: Multi-Agent Execution Control Plane

## Goal

Define the durable control plane that coordinates multiple AI agents across work items, branches, worktrees, PRs, merge gates, and cleanup state.

This domain does not replace git or GitHub.

It defines the source of truth that tells the system who owns what, what is safe to merge, and what is safe to clean up.

## Why Existing Branch Rules Are Not Enough

Branch/worktree rules alone are too weak because they do not persist:

- active ownership
- heartbeat or stale state
- handoff milestones
- stacked-PR lineage
- cleanup eligibility

Without a control plane, agents can produce correct code while the repository still drifts operationally.

## Canonical Entities

- `agent_session`
  - one agent's active execution unit
- `work_claim`
  - who currently owns a work item and in what mode
- `branch_lease`
  - which branch/worktree pair belongs to which session
- `handoff_event`
  - durable milestones such as `verified`, `pr_opened`, or `blocked`
- `merge_gate`
  - explicit mergeability status plus blockers
- `cleanup_candidate`
  - branch/worktree/runtime artifacts that are safe or nearly safe to remove

## Control-Plane Flow

```text
start
  -> claim
  -> lease
  -> heartbeat
  -> handoff
  -> reconcile
  -> PR
  -> merge
  -> cleanup
  -> close
```

Design rule:

- agents should operate inside a registered session and branch lease
- raw git state is a projection, not the coordination truth

## Design Rules

- fail closed
  - ambiguous ownership, stale sessions, or unsafe base state should warn or block
- merge-unit ownership first
  - default is one work item, one merge unit, one primary branch/worktree
- explicit parallelism
  - parallel work is allowed only through explicit child/stacked relationships
- CLI before UI
  - the first usable surface is terminal-first and scriptable
- durable recall
  - a new agent should resume from stored session state and reports, not from chat

## Automation Rollout

### Observe

- record sessions and report repo drift

### Warn

- surface stale sessions, ownership mismatches, and cleanup candidates

### Enforce

- block unsafe claims or merges when ownership is ambiguous

### Safe Cleanup

- remove merged or stale artifacts only after explicit safety checks
