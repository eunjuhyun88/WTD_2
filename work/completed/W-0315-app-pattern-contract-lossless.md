# W-0315 — App Pattern Contract Lossless Proxy

## Goal

Make app-side pattern routes preserve engine-owned candidate, state, transition, capture, and verdict semantics without fabricating phase metadata or timestamps.

## Owner

A088 — app/engine contract boundary.

## Scope

- Audit `app/src/routes/api/patterns/*` against engine pattern routes.
- Keep app routes thin where they proxy engine-owned pattern data.
- Move UI-only reshaping into app-side typed adapters if needed.
- Add focused tests for candidate/state contract preservation.

## Non-Goals

- Redesigning the terminal or pattern dashboard UI.
- Changing engine pattern semantics.
- Splitting the ledger database schema.
- Implementing new ML, personalization, or scan algorithms.

## Canonical Files

- `work/active/W-0315-app-pattern-contract-lossless.md`
- `docs/live/pattern-engine-runtime.md`
- `docs/live/contracts.md`
- `app/src/routes/api/patterns/+server.ts`
- `app/src/routes/api/patterns/states/+server.ts`
- `app/src/routes/api/patterns/transitions/+server.ts`
- `app/src/routes/api/patterns/[slug]/stats/+server.ts`
- `app/src/routes/api/patterns/[slug]/capture/+server.ts`
- `app/src/routes/api/patterns/[slug]/verdict/+server.ts`
- `engine/api/routes/patterns.py`
- `engine/patterns/scanner.py`

## Facts

- `engine/` is canonical backend truth for market logic and evaluation semantics.
- Engine already emits rich candidate records with `candidate_transition_id`, `entered_at`, `block_scores`, `feature_snapshot`, and alert policy metadata.
- Previous W-0029 removed some app-side fabricated phase semantics, but follow-up type and route alignment remained open.
- Pattern runtime state now has SQLite plus Supabase hydration/dual-write support, so app routes should not compensate with invented state.
- `/patterns` was converting engine `phase: "ACCUMULATION"` through `Number(...)` and then overwriting candidate `entered_at` with state `entered_at`.

## Assumptions

- Existing UI consumers can tolerate additive canonical fields.
- Route compatibility should preserve legacy top-level keys while adding lossless engine envelopes.

## Open Questions

- Should legacy flattened keys be deprecated now or kept until the next UI cleanup slice?

## Decisions

- This slice keeps backward-compatible response keys and adds canonical engine envelopes where missing.
- This slice does not modify engine semantics unless an app contract test exposes a real engine bug.
- UI reshaping now lives in `$lib/contracts/patterns`; pages consume `PatternCandidateView` / `PatternStateView` instead of inline `any` transforms.
- Candidate Save Setup payload is built from canonical engine fields, including `candidate_transition_id`, `scan_id`, `feature_snapshot`, and `block_scores`.
- `/api/patterns/[slug]/stats` remains UI-adapted in this slice; candidate/state surfaces stay lossless proxies.

## Next Steps

- Decide whether legacy flattened keys should be removed in a later cleanup slice.
- If raw engine stats are needed later, add a parallel raw route instead of overloading the UI-adapted stats route.

## Exit Criteria

- [x] App pattern pages no longer fabricate candidate timestamps or numeric phase meaning.
- [x] Candidate/state route responses remain lossless proxies; UI adapters handle display reshaping.
- [x] Scoped tests verify lossless preservation for candidate/state adapters.

## Handoff Checklist

- [x] Work item updated with final files touched.
- [x] Scoped verification command recorded.
- [x] Remaining contract gaps listed.

## Files Touched

- `app/src/lib/contracts/patterns.ts`
- `app/src/lib/contracts/patterns.test.ts`
- `app/src/lib/contracts/index.ts`
- `app/src/lib/types/patternStats.ts`
- `app/src/lib/types/patternStats.test.ts`
- `app/src/lib/components/patterns/PatternCard.svelte`
- `app/src/lib/components/patterns/PhaseBadge.svelte`
- `app/src/routes/api/patterns/[slug]/stats/+server.ts`
- `app/src/routes/patterns/+page.svelte`
- `app/src/routes/patterns/[slug]/+page.svelte`

## Verification

- `npm --prefix app run test -- src/lib/contracts/patterns.test.ts src/lib/types/patternStats.test.ts` — pass, 5 tests.
- `npm --prefix app install` — installed local app dev dependencies for this worktree.
- `npm --prefix app run check` — pass with 0 errors, 51 pre-existing warnings.
