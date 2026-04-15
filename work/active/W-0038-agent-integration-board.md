# W-0038 Agent Integration Board

## Goal

Create a CTO-owned queue for agent-produced branches, PRs, stashes, and work items so integration proceeds one merge unit at a time without mixing engine, app, contract, and research scopes.

## Owner

contract

## Scope

- Track active PRs and local branches by dependency order.
- Separate merge-ready work from speculative or stale agent output.
- Keep the integration order restartable from files, not chat.
- Record the next merge unit before touching code.

## Non-Goals

- No product or engine implementation in this work item.
- No bulk cleanup of all stashes at once.
- No direct push to `main`.

## Canonical Files

- `AGENTS.md`
- `work/active/W-0038-agent-integration-board.md`
- `work/active/W-0035-pattern-transition-persistence.md`
- `work/active/W-0036-terminal-persistence-first-rollout.md`
- `work/active/W-0037-pattern-capture-record.md`

## Facts

- `main` is at `572a53b` after PR `#43`.
- PR `#43` (`codex/w-0035-pattern-transition-persistence`) is merged.
- `codex/w-0036-terminal-persistence-rollout` and `codex/w-0037-pattern-capture-record` were created before PR `#43` merged and need realignment onto current `main`.
- Terminal PRs `#38`-`#41` are a stacked app-surface lane and should not be mixed with the engine persistence lane.
- Local stashes contain terminal/right-rail leftovers and quarantined WIP; they are not merge units until selectively recovered.

## Assumptions

- `W-0037` capture linkage should build on merged `W-0035` transition persistence.
- `W-0036` terminal persistence rollout should be split into app-domain routes, analyze contract, and engine-memory slices before merge.
- Draft PRs remain draft until their exact verification gate is recorded.

## Open Questions

- Whether terminal stack `#38`-`#41` should be rebased onto current `main` or closed in favor of a fresh consolidated app branch.
- Which stashes contain recoverable terminal right-rail work versus broken exploratory output.

## Decisions

- Integrate by dependency lane: engine persistence first, then capture linkage, then terminal persistence/app surface.
- Treat each PR as one primary change type; do not use W-0036 as a mixed all-in-one merge unit.
- Preserve stashes until their contents are inspected against a named work item.
- Use compact checkpoints after each completed merge unit.
- After PR `#43`, the next active engine merge unit is W-0037 capture records.

## Next Steps

1. Rebase or recreate `W-0037` from updated `main` and implement capture records.
2. Split `W-0036` into smaller app/contract/engine-memory slices before implementation PRs.
3. Audit terminal PR stack and stashes before selecting the next app merge unit.

## Exit Criteria

- All active agent work has a queue position, owner, and next action.
- The next merge unit is always explicit before any code change.
- No stale branch or stash is treated as active without inspection.

## Handoff Checklist

- Active integration owner: CTO/contract.
- Verification status: queue created; PR `#43` merged.
- Remaining blockers: W-0037 branch realignment and terminal stack triage.
