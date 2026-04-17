# W-0077 Capture-to-Lab Intake Adapter

## Goal

Make the Day-1 core loop move forward after `Save Setup` by letting `/lab` intake a saved `capture`, open a draft evaluation context, and preserve source-capture visibility without auto-creating hidden challenge artifacts during save.

## Owner

app

## Scope

- add an explicit post-save handoff from terminal capture success into `/lab`
- let `/lab` read a saved `capture` by `captureId` and hydrate source-capture context
- adapt the current lab strategy workbench so one saved capture can open as a draft evaluation target
- keep source capture visible in lab while the user evaluates or edits the derived draft

## Non-Goals

- implementing the full canonical filesystem-backed `challenge` bridge
- replacing the current lab runner/backtest substrate
- adding watch activation routes or dashboard feedback changes in this slice
- changing engine evaluation semantics

## Canonical Files

- `AGENTS.md`
- `work/active/W-0077-capture-to-lab-intake-adapter.md`
- `work/active/W-0056-core-loop-ux-agent-execution-blueprint.md`
- `docs/product/core-loop-agent-execution-blueprint.md`
- `docs/product/pages/03-lab.md`
- `docs/domains/lab.md`
- `docs/domains/core-loop-route-contracts.md`
- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/routes/lab/+page.svelte`
- `app/src/lib/api/terminalPersistence.ts`
- `app/src/lib/stores/strategyStore.ts`

## Facts

- `Save Setup` now succeeds only through the canonical capture route and returns a saved capture id.
- `/lab` is still strategy/backtest-centered and does not yet expose a canonical challenge intake path for saved captures.
- the current docs require lab to begin after terminal has already created durable capture evidence.
- the repository worktree is dirty, so this slice should stay narrow and app-only.
- terminal capture success now exposes `Open in Lab` using `captureId`, and `/lab` can hydrate that capture into a source-visible draft strategy context.

## Assumptions

- a capture-driven draft strategy adapter is an acceptable Day-1 bridge until the canonical challenge filesystem lane lands
- source capture visibility in lab is more important than perfect one-to-one challenge semantics in this slice

## Open Questions

- whether the post-save handoff should later land as a dedicated toast/banner CTA or become the default success path
- whether the capture-driven draft strategy adapter should later be replaced by a canonical persisted `challenge` projection route without changing the user-facing handoff

## Decisions

- keep `Save Setup` itself capture-only and make lab intake an explicit next action
- use `captureId` query hydration into `/lab` rather than hidden save-time challenge creation
- derive a lightweight draft evaluation context from the saved capture while keeping the source capture visible

## Next Steps

1. replace the draft strategy adapter with canonical persisted challenge projection when the lab challenge bridge lands
2. align terminal success copy and CTA hierarchy around `capture -> open in lab -> evaluate`
3. verify the end-to-end browser flow visually after the next UI pass on terminal/lab

## Exit Criteria

- terminal save success exposes a working path into `/lab` with a concrete `captureId`
- `/lab` can open from that `captureId` and show source capture context plus a draft evaluation target
- the user can continue directly into the current lab evaluation flow without re-entering the setup manually

## Handoff Checklist

- this slice is app-only
- preserve `capture-first` semantics; do not auto-create hidden challenge artifacts in terminal save
- treat the lab draft as an adapter over current strategy flow, not as canonical challenge completion
