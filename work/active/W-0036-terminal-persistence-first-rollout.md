# W-0036 Terminal Persistence-First Rollout

## Goal

Turn the mixed local terminal persistence work into reviewable merge units with one owner, one primary change type, and one verification gate each.

## Owner

app

## Scope

- Define the rollout split for terminal persistence and related app/engine contract work.
- Keep the split restartable from files, not chat residue.
- Prevent terminal persistence, engine memory, and Save Setup capture link work from shipping as one mixed PR.

## Non-Goals

- No implementation in this planning work item.
- No direct merge of the current mixed local diff.
- No closure of historical terminal PRs without explicit triage.

## Canonical Files

- `work/active/W-0036-terminal-persistence-first-rollout.md`
- `work/active/W-0038-agent-integration-board.md`
- `work/active/W-0039-terminal-save-setup-capture-link.md`
- `work/active/W-0041-terminal-analyze-contract-surface.md`
- `work/active/W-0042-terminal-app-domain-persistence.md`
- `work/active/W-0043-engine-memory-state-persistence.md`

## Facts

- The current local `task/w-0024-terminal-attention-implementation` diff mixes app surface changes, app-domain persistence routes, and engine memory persistence.
- `W-0035` and `W-0037/W-0040` are already merged, so Save Setup capture linkage can build on stable engine transition/capture APIs.
- The current mixed diff does not yet include the app-domain route files in tracked form on `main`; they remain local-only.
- Open terminal PRs `#38`-`#41` and `#44` represent a separate terminal surface lane and must be triaged independently.

## Assumptions

- The cleanest path is to rebuild merge units from `main`, not to salvage the mixed local branch directly.
- Each split can be validated independently with targeted app or engine checks.

## Open Questions

- Whether parts of the local terminal UI diff duplicate functionality already present in PR stack `#38`-`#41` and `#44`.

## Decisions

- `W-0036` remains the umbrella rollout, not a direct implementation PR.
- The rollout is split into:
  - `W-0041` analyze contract plus terminal surface consumption
  - `W-0042` app-domain persistence routes and client
  - `W-0043` engine memory state persistence
  - `W-0039` terminal Save Setup capture link
- Any code recovery from the mixed local branch must be restaged into clean branches for each split.

## Next Steps

1. Triage terminal PR stack `#38`-`#41` and `#44` against the current local diff.
2. Recover and restage `W-0042` app-domain persistence on a clean branch.
3. Recover and restage `W-0041` analyze contract/surface work after terminal stack overlap is understood.
4. Recover and restage `W-0043` engine memory state persistence independently from app work.
5. Finish `W-0039` only after `W-0041` and `W-0042` provide stable app-side candidate context.

## Exit Criteria

- Every remaining terminal persistence change belongs to exactly one named work item.
- No mixed local branch is treated as a merge unit.
- The next implementation branch can be chosen without rereading chat.

## Handoff Checklist

- Active role: CTO/app coordination.
- Verification status: planning only.
- Remaining blockers: terminal PR stack overlap and local diff triage.
