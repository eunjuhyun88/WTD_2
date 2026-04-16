# W-0064 Save Setup Capture Route Stabilization

## Goal

Make `Save Setup` use the capture-first contract without challenge fallback so `/terminal` persists reviewed-range evidence through the canonical capture route every time.

## Owner

app

## Scope

- remove the legacy challenge-create fallback from the `Save Setup` flow
- keep `/api/terminal/pattern-captures` as the only browser-facing success path for `Save Setup`
- enforce the reviewed-range payload requirements at the app contract boundary
- align terminal success/error UI with the capture-first contract
- preserve downstream projection hooks without auto-creating a challenge during save

## Non-Goals

- implementing lab challenge projection routes
- redesigning chart range selection UX beyond the current reviewed-range substrate
- changing engine capture scoring or evaluation semantics
- touching unrelated terminal persistence, screener, or progression lanes

## Canonical Files

- `AGENTS.md`
- `work/active/W-0064-save-setup-capture-route-stabilization.md`
- `work/active/W-0036-terminal-persistence-first-rollout.md`
- `work/active/W-0051-chart-range-capture-core-loop.md`
- `docs/domains/core-loop-route-contracts.md`
- `docs/domains/core-loop-object-contracts.md`
- `docs/product/pages/02-terminal.md`
- `docs/runbooks/core-loop-migration-plan.md`
- `app/src/components/terminal/workspace/SaveSetupModal.svelte`
- `app/src/lib/contracts/terminalPersistence.ts`
- `app/src/lib/server/terminalPersistence.ts`
- `app/src/routes/api/terminal/pattern-captures/+server.ts`
- `app/src/routes/terminal/+page.svelte`

## Facts

- `POST /api/terminal/pattern-captures` is the canonical browser-facing `Save Setup` route in the capture-first core loop.
- `POST /api/wizard` is explicitly a secondary helper path and must not be used as fallback when `Save Setup` fails.
- the previous terminal persistence rollout still documents a legacy `Save Setup -> engine capture when candidate transition context exists, otherwise legacy challenge create` branch.
- the current local root worktree is dirty with unrelated app, engine, and docs changes, so this slice needs a fresh `origin/main` worktree and execution branch.
- `SaveSetupModal.svelte` currently writes the app capture record opportunistically, then falls back to `/api/engine/challenge/create` for manual saves and for `400` responses from `/api/engine/captures`.
- `PatternCaptureCreateRequestSchema` and `createPatternCapture()` currently accept saves without `snapshot.viewport`, and `/terminal/+page.svelte` does not pass a viewport-capture callback into the active `SaveSetupModal` instance.

## Assumptions

- latest `origin/main` includes the merged core-loop execution pack and is the correct reconstruction baseline
- reviewed-range evidence is already capturable through current terminal chart plumbing, even if the UX remains visible-range based for now

## Open Questions

- whether success UI should surface capture id only or also expose an explicit follow-up CTA into future lab projection once that route exists

## Decisions

- branch split reason: implement this slice on a fresh latest-`origin/main` worktree because the current branch contains unrelated mixed lanes and cannot produce a clean app-only PR
- `Save Setup` succeeds only when capture creation succeeds; there is no fallback path that creates a challenge instead
- downstream challenge projection stays explicit and subsequent to capture creation, not part of the save transaction
- this slice will make viewport-backed reviewed-range evidence mandatory at the contract boundary and wire the active terminal page modal to the current chart viewport provider
- pattern transition alerts may surface live context, but they must not auto-create reviewed captures without a human-selected range

## Next Steps

1. review the save-success follow-up UX once lab projection routes exist so capture detail and project-in-lab CTAs stay explicit
2. prepare a clean app-only PR from this branch after commit

## Exit Criteria

- terminal `Save Setup` uses only `/api/terminal/pattern-captures` for successful saves
- missing reviewed-range evidence fails clearly instead of falling back to challenge creation
- terminal copy/state makes the saved artifact legible as a capture, not a challenge substitute
- targeted app checks pass on the clean slice branch

## Handoff Checklist

- branch-split rationale and implementation boundaries are recorded here
- next agent can reconstruct the slice from the canonical route/object docs without chat context
- verification target is limited to the terminal capture route and related contract/UI path
- verification completed:
  - `npm run check -- --fail-on-warnings`
  - `npm test -- --run src/lib/contracts/terminalPersistence.test.ts src/routes/api/terminal/pattern-captures/pattern-captures.test.ts src/lib/terminal/terminalController.test.ts`
