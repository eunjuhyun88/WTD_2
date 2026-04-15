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
- `work/active/W-0041-terminal-analyze-contract-surface.md`
- `work/active/W-0042-terminal-app-domain-persistence.md`
- `work/active/W-0043-engine-memory-state-persistence.md`

## Facts

- `main` is at `f168df0` after PR `#46`.
- PR `#43` (`codex/w-0035-pattern-transition-persistence`) is merged.
- PR `#46` (`codex/w-0037-pattern-capture-record-clean`) is merged and includes W-0037 capture records plus W-0040 candidate metadata.
- `W-0036` terminal persistence rollout is now explicitly split into `W-0041`, `W-0042`, `W-0043`, and `W-0039`.
- Terminal PRs `#38`-`#41` are a stacked app-surface lane and should not be mixed with the engine persistence lane.
- PR `#40` is stale and overbroad: it mixes already-merged governance/memory/security work with old terminal surface changes.
- PR `#44` is the main-based selection-state candidate and is a better comparison target than the older stacked `#38`.
- Local stashes contain terminal/right-rail leftovers and quarantined WIP; they are not merge units until selectively recovered.

## Assumptions

- `W-0036` terminal persistence rollout should be split into app-domain routes, analyze contract, and engine-memory slices before merge.
- Draft PRs remain draft until their exact verification gate is recorded.

## Open Questions

- Whether `#41` and `#39` should be rebuilt on top of `#44` or replaced by a fresh `W-0041` surface branch.
- Which stashes contain recoverable terminal right-rail work versus broken exploratory output.

## Decisions

- Integrate by dependency lane: engine persistence first, then capture linkage, then terminal persistence/app surface.
- Treat each PR as one primary change type; do not use W-0036 as a mixed all-in-one merge unit.
- Preserve stashes until their contents are inspected against a named work item.
- Use compact checkpoints after each completed merge unit.
- After PR `#46`, the next active merge unit should be selected from W-0036 only after stash/dirty diff triage.
- Treat PR `#40` as obsolete unless a file-by-file salvage case is explicitly proven.

## Next Steps

1. Decide whether `#44` becomes the surviving selection-state base and retire `#38`.
2. Rebuild or retire `#41` and `#39` after comparing them with current `W-0041` needs.
3. Recover `W-0042` app-domain persistence into a clean branch.
4. Recover `W-0043` engine memory persistence into a clean branch.
5. Inspect terminal stashes and keep only recoverable work tied to `W-0039` or `W-0041`.

## Exit Criteria

- All active agent work has a queue position, owner, and next action.
- The next merge unit is always explicit before any code change.
- No stale branch or stash is treated as active without inspection.

## Handoff Checklist

- Active integration owner: CTO/contract.
- Verification status: PR `#43` and PR `#46` merged; W-0038 queue updated.
- Remaining blockers: terminal stack triage, `W-0042`/`W-0043` clean-branch recovery, stash inspection.
