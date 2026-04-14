# CHATBATTLE Foundation Refactor Plan

Date: 2026-03-20
Status: active
Scope: `/Users/ej/Downloads/wtd-clones/CHATBATTLE`

## Goal

Refactor `CHATBATTLE` without a full rewrite by applying this order:

1. performance stabilization
2. route and component decomposition
3. state authority and API contract repair
4. surface consolidation and dead-path cleanup

This plan is intentionally sequence-first. It defines where to start, where to stop, and what must not be mixed into the first batches.

## Why This Order

Current evidence says the repo is not blocked by one bug. It is blocked by oversized route shells, oversized chart surfaces, blurred store authority, and a warning-heavy UI baseline that raises regression cost.

If structure work starts before stabilizing the hottest runtime surfaces, every later refactor inherits slow feedback and noisy regressions.

If performance work starts without ownership cleanup, the team only moves complexity around.

## Evidence Snapshot

### Largest current files

- `src/routes/arena/+page.svelte`: 4236 lines
- `src/components/arena/ChartPanel.svelte`: 4003 lines
- `src/routes/terminal/+page.svelte`: 3608 lines
- `src/components/terminal/IntelPanel.svelte`: 2775 lines
- `src/routes/passport/+page.svelte`: 2688 lines
- `src/lib/engine/v2BattleEngine.ts`: 1500 lines
- `src/components/arena/Lobby.svelte`: 1455 lines

### Current structural warnings

- `npm run check`: PASS with `0 errors / 47 warnings`
- Most warnings are not random lint noise. They cluster around:
  - arena and arena-v2 presentation debt
  - deprecated Svelte slot usage
  - a11y gaps in battle setup and human-call flows
  - self-closing invalid HTML in large battle components

### Current build signals

- `npm run build`: PASS
- Largest server page outputs:
  - `src/routes/terminal/+page.svelte`: about `148.66 kB`
  - `src/routes/arena-v2/+page.svelte`: about `138.90 kB`
  - `src/routes/arena/+page.svelte`: about `117.70 kB`
  - `src/routes/passport/+page.svelte`: about `29.51 kB`
  - `src/routes/signals/+page.svelte`: about `27.34 kB`
- Largest server chunks:
  - `ChartPanel.js`: about `37.35 kB`
  - `scanEngine.js`: about `37.96 kB`
  - `api/terminal/intel-policy`: about `53.68 kB`
  - `api/arena/analyze`: about `67.72 kB`

## Non-Negotiable Invariants

1. No full rewrite.
2. `priceStore` remains the single client owner of live price truth.
3. Route stores remain transient and must not become hidden persistence layers.
4. Durable profile, signal, trade, and history data remain server-authoritative.
5. The first phase must reduce runtime churn before broad IA or copy changes.
6. Large route shells must be split by responsibility, not only by line count.

## Start Here

Start with the surfaces that combine all three failure modes:

1. high runtime churn
2. high file size / low change isolation
3. cross-cutting authority confusion

That means:

1. `Terminal`
2. `Arena` chart stack
3. `Passport` authority cleanup

Do not start with:

- visual redesign
- broad route renaming
- archive cleanup as a first move
- battle-v2 warning cleanup as a standalone effort

Those are later or parallel cleanup tasks, not the trunk path.

## Stop Here

This foundation refactor is complete when all of the following are true:

1. `terminal/+page.svelte`, `arena/+page.svelte`, and `passport/+page.svelte` are route shells rather than god files.
2. `ChartPanel.svelte` is only a coordinator over extracted chart runtime, overlay, and indicator modules.
3. live price propagation no longer fans through unrelated route stores.
4. the main server-authoritative stores are projection-oriented and no longer treat local persistence as truth.
5. `npm run check` warnings are cut from `47` to a smaller intentional budget, with arena-v2 debt explicitly isolated.
6. build output for primary route shells trends downward enough that further product work is safe again.

This phase does not require:

- removing every legacy route
- eliminating every warning in the repo
- final product positioning or rebranding cleanup

## Phases

### Phase 0. Baseline and Guardrails

Purpose:
- freeze measurement and stop accidental side quests

Deliverables:

- warning budget grouped by surface
- route-shell size table
- top reactivity owners list
- explicit ownership map for `priceStore`, `gameState`, `userProfileStore`, `quickTradeStore`, `trackedSignalStore`

Exit criteria:

- every later slice has a before/after metric
- no one is treating cosmetic cleanup as performance work

### Phase 1. Performance Stabilization

Purpose:
- reduce unnecessary runtime churn before deeper splits

Primary targets:

- `src/routes/terminal/+page.svelte`
- `src/components/terminal/IntelPanel.svelte`
- `src/routes/arena/+page.svelte`
- `src/components/arena/ChartPanel.svelte`
- `src/lib/stores/gameState.ts`
- `src/lib/stores/priceStore.ts`

Required moves:

1. stop mirroring live prices into unrelated stores
2. isolate polling, timers, subscriptions, and resize observers from presentation
3. extract chart runtime updates from render components
4. lazy-load or defer heavy route-only modules where safe

Exit criteria:

- no route shell owns both layout and long-running orchestration
- chart updates can be reasoned about without opening a 4000-line component

### Phase 2. Structural Decomposition

Purpose:
- reduce regression radius and make changes reviewable

Primary targets:

- `src/routes/terminal/+page.svelte`
- `src/routes/arena/+page.svelte`
- `src/routes/passport/+page.svelte`
- `src/components/terminal/WarRoom.svelte`
- `src/components/arena/Lobby.svelte`

Required moves:

1. route shell -> controller/view-model -> presentation split
2. shared UI and controller boundaries for repeated patterns
3. local route state kept near the route, domain operations moved out

Suggested target layout:

- `src/routes/*/+page.svelte`: entry, data wiring, top-level composition only
- `src/lib/features/<surface>/controllers/*`
- `src/lib/features/<surface>/components/*`
- `src/lib/features/<surface>/services/*`

Exit criteria:

- each primary route shell is small enough to review without scrolling through mixed concerns
- feature folders express responsibility better than the current flat sprawl

### Phase 3. Authority and Contract Repair

Purpose:
- fix the places where performance issues come back because authority is unclear

Primary targets:

- `src/lib/stores/userProfileStore.ts`
- `src/lib/stores/quickTradeStore.ts`
- `src/lib/stores/trackedSignalStore.ts`
- `src/routes/api/profile/+server.ts`
- `src/routes/api/quick-trades/**`
- `src/routes/api/signals/**`
- `src/routes/api/copy-trades/**`

Required moves:

1. projection stores stop acting like durable truth
2. optimistic flows reconcile by stable mutation identity
3. write routes converge on shared request/body guard patterns

Exit criteria:

- client state can be thrown away and rebuilt from server truth without semantic loss
- store hydration logic no longer invents hidden merge behavior

### Phase 4. Surface Consolidation

Purpose:
- reduce app complexity after the foundation is stable

Primary targets:

- `/lab`, `/passport`, `/agent`
- `/arena`, `/arena-v2`, `/arena-war`
- six-surface bridge docs versus shipped runtime reality

Required moves:

1. choose one primary battle path and demote the others
2. choose one primary agent/profile surface and demote the others
3. archive or quarantine prototype-only surfaces

Exit criteria:

- the shipped surface map matches the docs closely enough that onboarding and implementation no longer drift apart

### Phase 5. Quality Ratchet

Purpose:
- stop the repo from sliding back after the big files shrink

Required moves:

1. warning budget by surface
2. file-size budget for route shells and hot components
3. lightweight performance checklist for chart and terminal work
4. update canonical docs when boundaries change

Exit criteria:

- future refactors are incremental, not rescue work

## Recommended Execution Slices

### Slice A. Terminal stabilization

Do first.

Why:
- highest route payload
- largest user-facing orchestration shell
- best chance to remove polling/reactivity churn without product ambiguity

Definition:

- extract terminal controller/view-model
- move timers, fetch cadence, and panel-selection logic out of the route shell
- keep UI behavior the same

### Slice B. ChartPanel decomposition

Do second.

Why:
- biggest isolated component hotspot
- highest regression risk
- prerequisite for reliable arena work

Definition:

- split chart runtime, indicator engine, overlay renderer, and trade planner hooks
- keep `ChartPanel.svelte` as a coordinator

### Slice C. Passport authority repair

Do third.

Why:
- structure work on profile is wasted if server/client truth is still blurred

Definition:

- move local persistence usage down to cache/fallback only
- tighten store hydration and mutation reconcile logic

## What Not To Mix Into Slice A

- full rebrand from `WTD` to `CHATBATTLE`
- archive-wide doc cleanup
- arena-v2 warning cleanup
- unrelated a11y sweeps across every surface
- route IA expansion

## Success Metrics

Track these after every slice:

1. top route shell line counts
2. top hot-component line counts
3. `npm run check` warning count by surface
4. build output size for `terminal`, `arena`, and `passport`
5. number of stores classified as transient vs projection vs canonical owner

## First Implementation Contract

Start with one narrow contract:

- Surface: `terminal`
- Appetite: `1-2` focused slices
- Allowed changes:
  - controller extraction
  - timer/polling orchestration extraction
  - route shell slimming
  - build/check metric capture
- Not allowed:
  - copy rewrite
  - route rename
  - cross-surface visual redesign

If Slice A does not make the route shell smaller and more legible without behavior regressions, stop and correct the structure before touching Arena.
