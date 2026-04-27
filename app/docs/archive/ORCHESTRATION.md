# Work Orchestration

This file defines the generic workboard layer that sits above raw coordination claims.

Claims answer:

- who currently owns a path boundary
- which branch/worktree is allowed to edit it

Orchestration answers:

- what should happen next
- which work items are blocked
- which dependencies must finish first
- who should receive a handoff next

## Orchestration Model

The unit of planning is a work item keyed by `workId`.

Each work item may include:

- title and summary
- surface
- status
- priority
- current agent / branch
- owned paths and referenced docs
- dependency IDs
- expected outputs
- handoff target

Work items live under `.agent-context/orchestration/work-items/`.

## Status Model

Supported statuses:

- `planned`
- `ready`
- `active`
- `blocked`
- `handoff`
- `done`
- `abandoned`

Guideline:

- use `planned` for scoped work that is not ready for execution yet
- use `ready` when dependencies are satisfied and the item can be claimed next
- use `active` when there is a live coordination claim for the same work ID
- use `blocked` when an external dependency or decision is still missing
- use `handoff` when execution paused and a named next owner should resume
- use `done` or `abandoned` when the item is terminal

## Commands

- `npm run orch:work`
  - create or update a work item
- `npm run orch:list`
  - list the current board
- `npm run orch:list -- --ready-only`
  - show only dependency-clear ready work
- `npm run orch:list -- --json`
  - machine-readable queue surface
- `npm run orch:check`
  - validate dependency graph, claim sync, and handoff completeness
- `npm run pilot:start -- --work-id <id>`
  - claim, checkpoint, resume, save, and compact a specific item
- `npm run pilot:start -- --pick ready --agent <agent>`
  - pick the highest-priority ready item and boot the session safely
- `npm run pilot:sync -- --work-id <id>`
  - refresh snapshot + brief/handoff artifacts for the current task

## Sync Rules

The orchestration layer should reduce coordination overhead, not duplicate it manually.

- `coord:claim` should sync the matching work item to `active`
- `coord:release -- --status done` should sync the work item to `done`
- `coord:release -- --status handoff --handoff-to <agent>` should sync the work item to `handoff`
- `ctx:resume` should show orchestration state when a matching work item exists

If orchestration is enabled, treat claims as execution locks and work items as the queue / dependency graph.

## Optional Autopilot

The autopilot layer is optional and intentionally narrow.

It exists to reduce repeated session boot steps, not to replace judgment.

Rules:

- keep it opt-in by command, not background magic
- prefer `workId` first, then branch pointer, then `--pick ready`
- ignore and clear stale branch/runtime pointers that no longer resolve to actionable work
- never merge, push, or delete branches
- keep `--pick ready` dependency-aware and claim-aware
- use `--force` only when a human intentionally wants to bypass queue state

Recommended use:

1. queue work with `orch:work`
2. mark items `ready` only when dependencies are actually clear
3. start with `pilot:start`
4. keep saving/compacting during work with `pilot:sync` or the lower-level `ctx:*` commands
5. release with `coord:release`

## Runtime Artifacts

The orchestration layer keeps two runtime artifacts:

- `.agent-context/orchestration/board.md`
  - human-readable queue board
- `.agent-context/orchestration/summary.json`
  - machine-readable summary for external automation

These are runtime memory, not canonical product specs.

## Dependency Rules

- depend only on work IDs that already exist
- do not mark an item `ready` or `active` while dependencies are still open
- do not leave `handoff` items without a named `handoffTo`
- keep dependencies shallow when possible; orchestration should clarify work, not create a fake PM system

## Recommended Flow

1. create a work item with `orch:work`
2. add dependencies if sequencing matters
3. move the item to `ready` when preconditions are satisfied
4. create a coordination claim when execution actually starts
5. use `ctx:checkpoint`, `ctx:save`, and `ctx:resume` during implementation
6. release with `done`, `handoff`, or `abandoned`
7. run `orch:check` when the queue needs cleanup or before automation consumes it
