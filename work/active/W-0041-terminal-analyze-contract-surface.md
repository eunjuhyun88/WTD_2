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
- `app/src/components/terminal/workspace/TerminalContextPanel.svelte`

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
- Exclude page-level persistence controls, memory adapter wiring, and left-rail watchlist changes from this slice.
- Prefer adapter and panel-level consumption changes over route-level orchestration when explicit analyze fields can flow without new page state.
- This slice should merge before `W-0044`, because persistence should store and replay explicit decision fields rather than fallback-derived UI semantics.

## Next Steps

1. Commit the narrowed contract-consumer diff.
2. Open the clean PR for review against `main`.
3. Follow up separately on `W-0039` Save Setup capture link.

## Exit Criteria

- Terminal surfaces prefer explicit analyze fields.
- Contract and mapper tests pass.
- The PR contains no persistence-route or engine-memory changes.

## Reviewer Notes

- Product value:
  - removes hidden UI inference for entry, risk, flow, and sources
  - makes `/terminal` render deterministic decision semantics from the canonical analyze envelope
- Why this should go first:
  - later persistence and recall features should store explicit decision fields, not UI-derived approximations
  - this reduces semantic drift between analyze payload, panel rendering, and restored terminal state
- Main files to review:
  - `app/src/lib/contracts/terminalBackend.ts`
  - `app/src/lib/server/analyze/responseMapper.ts`
  - `app/src/lib/server/analyze/responseMapper.test.ts`
  - `app/src/lib/terminal/panelAdapter.ts`
  - `app/src/components/terminal/workspace/TerminalContextPanel.svelte`

## PR Body Draft

- Summary:
  - add explicit `entryPlan`, `riskPlan`, `flowSummary`, and `sources` support to the analyze contract
  - map these fields through the response mapper and terminal adapters
  - update terminal panel rendering to consume explicit fields before fallback derivation
- Why now:
  - `/terminal` still infers too much product meaning from raw market fields
  - downstream persistence and recall work should depend on explicit decision semantics
- Verification:
  - `npm run check -- --fail-on-warnings`
  - `npm test -- --run src/lib/server/analyze/responseMapper.test.ts`

## Handoff Checklist

- Verification status: `npm run check -- --fail-on-warnings` passed; `npm test -- --run src/lib/server/analyze/responseMapper.test.ts` passed.
- Remaining blockers: none inside `W-0041`; persistence and Save Setup actions remain intentionally out of scope.
