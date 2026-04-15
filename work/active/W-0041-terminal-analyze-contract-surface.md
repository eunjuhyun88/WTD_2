# W-0041 Terminal Analyze Contract Surface

## Goal

Make `/terminal` consume explicit analyze contract fields instead of inferring risk, flow, and source semantics from raw data.

## Owner

contract

## Scope

- Extend and stabilize the app-facing analyze contract.
- Map `entryPlan`, `riskPlan`, `flowSummary`, and `sources` in the response mapper and terminal adapters.
- Update terminal surface components only where they consume the explicit contract.

## Non-Goals

- No watchlist/pins/alerts/exports persistence routes.
- No engine memory durability.
- No Save Setup capture posting.

## Canonical Files

- `work/active/W-0041-terminal-analyze-contract-surface.md`
- `app/src/lib/contracts/terminalBackend.ts`
- `app/src/lib/server/analyze/responseMapper.ts`
- `app/src/lib/server/analyze/responseMapper.test.ts`
- `app/src/lib/terminal/panelAdapter.ts`
- `app/src/lib/terminal/terminalBoardModel.ts`
- `app/src/lib/api/terminalBackend.ts`
- `app/src/routes/terminal/+page.svelte`

## Facts

- The local mixed diff already touches the mapper, backend contract types, panel adapter, board model, and terminal page.
- This slice is mostly contract and surface consumption; it should pass `app` checks without requiring new authenticated persistence routes.
- Some surface overlap may exist with open terminal PR stack `#38`-`#41` and `#44`.

## Assumptions

- Explicit analyze fields reduce UI guesswork and can ship independently from persistence.

## Open Questions

- Which local surface hunks overlap with still-open terminal PRs and should be rebased or discarded.

## Decisions

- Keep this slice limited to analyze contract and terminal rendering consumption.
- Treat terminal page and surface edits here as contract-consumer changes, not persistence work.

## Next Steps

1. Diff the local surface changes against PR stack `#38`-`#41` and `#44`.
2. Reconstruct the minimal contract-consumer branch from `main`.
3. Run `npm run check -- --fail-on-warnings` plus targeted response-mapper/contract tests.

## Exit Criteria

- Terminal surfaces prefer explicit analyze fields.
- Contract and mapper tests pass.
- The PR contains no persistence-route or engine-memory changes.

## Handoff Checklist

- Verification status: not yet restaged on a clean branch.
- Remaining blockers: overlap with open terminal surface PRs.
