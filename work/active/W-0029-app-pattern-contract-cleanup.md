# W-0029 App Pattern Contract Cleanup

## Goal

Make app-side pattern routes and consumers preserve engine-owned pattern semantics instead of flattening, renaming, or inventing fields.

## Owner

contract

## Scope

- clean up app pattern proxy routes so they are as lossless as possible
- remove app-side hardcoded phase assumptions and fabricated timestamps
- update app consumers to derive UI view models from canonical engine envelopes
- keep the scope limited to pattern candidates and state contracts

## Non-Goals

- redesigning the pattern dashboard UX
- replacing the engine route shapes
- implementing durable state persistence
- implementing pattern registry or ML rollout changes

## Canonical Files

- `work/active/W-0029-app-pattern-contract-cleanup.md`
- `app/src/routes/api/patterns/+server.ts`
- `app/src/routes/api/patterns/states/+server.ts`
- `app/src/components/terminal/workspace/PatternStatusBar.svelte`
- `app/src/routes/patterns/+page.svelte`
- `app/src/lib/terminal/terminalDataOrchestrator.ts`
- `engine/api/routes/patterns.py`

## Decisions

- app routes should proxy canonical engine meaning and move UI reshaping into consumers
- `since` and entry-phase metadata must not be fabricated by the app layer
- state should stay organized around engine-owned `pattern_slug -> symbol -> rich state` data

## Next Steps

- add shared app-side types for engine pattern envelopes if this slice expands
- clean up stats routes in a follow-up slice if field normalization becomes a maintenance burden
- align dashboard and terminal consumers on a single adapter utility if more pattern surfaces are added

## Exit Criteria

- app pattern proxies no longer hardcode phase semantics or fabricate timestamps
- terminal and dashboard pattern consumers render from engine-owned envelopes
- route/app contract drift is reduced for future pattern-engine work
