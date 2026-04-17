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
- the current `SaveSetupModal` implementation has now been aligned to capture-only success: reviewed-range viewport is required, app capture persistence is the only save success path, and success callbacks now use capture ids instead of challenge-like slugs.

## Assumptions

- latest `origin/main` includes the merged core-loop execution pack and is the correct reconstruction baseline
- reviewed-range evidence is already capturable through current terminal chart plumbing, even if the UX remains visible-range based for now

## Open Questions

- whether the terminal success state should later expose `Open in Lab` directly from the post-save confirmation instead of only showing capture completion

## Decisions

- branch split reason: implement this slice on a fresh latest-`origin/main` worktree because the current branch contains unrelated mixed lanes and cannot produce a clean app-only PR
- `Save Setup` succeeds only when capture creation succeeds; there is no fallback path that creates a challenge instead
- downstream challenge projection stays explicit and subsequent to capture creation, not part of the save transaction

## Next Steps

1. create a clean worktree and branch from latest `origin/main` for this slice before preparing a clean PR
2. align any remaining terminal save-copy or CTA language to `capture` vocabulary instead of `challenge` or legacy pattern-save language
3. run targeted app checks for terminal persistence contracts and the `Save Setup` path on the clean slice branch

## Exit Criteria

- terminal `Save Setup` uses only `/api/terminal/pattern-captures` for successful saves
- missing reviewed-range evidence fails clearly instead of falling back to challenge creation
- terminal copy/state makes the saved artifact legible as a capture, not a challenge substitute
- targeted app checks pass on the clean slice branch

## Handoff Checklist

- branch-split rationale and implementation boundaries are recorded here
- next agent can reconstruct the slice from the canonical route/object docs without chat context
- verification target is limited to the terminal capture route and related contract/UI path
