# CHATBATTLE Repo-Wide Refactor Design

Date: 2026-04-11
Status: active
Scope: `/Users/ej/Downloads/wtd-clones/CHATBATTLE`

## Goal

Stabilize and simplify the repo without a rewrite by executing refactor work in this order:

1. branch and surface isolation
2. route-shell decomposition
3. state-authority repair
4. terminal and cogochi convergence
5. surface reduction and cleanup

This design updates the March refactor baseline with the current April reality:

- `Alpha Flow` terminal integration is already changing shared home and header surfaces
- the repo still contains multiple legacy routes and parallel route concepts
- the hottest files remain concentrated in route shells and chart-heavy components
- there is still no consistent controller or feature-folder layer in the live code

## Why A New Top-Level Design Is Needed

The existing active plans are directionally correct, but they now describe only slices of the problem:

- March plans define architecture cleanup, state authority, and terminal split
- April plans define the `Alpha Flow` terminal integration and home/header convergence
- the live branch shows these concerns now overlap in shared files

Without one updated trunk plan, the repo will keep accumulating:

1. new UI density inside old route shells
2. more global-header coupling before state ownership is repaired
3. more divergence between canonical docs and shipped route reality

## Current Evidence Snapshot

### Hotspot files by line count

- `src/routes/arena/+page.svelte`: 4237
- `src/components/arena/ChartPanel.svelte`: 4003
- `src/routes/terminal-legacy/+page.svelte`: 3454
- `src/components/terminal/IntelPanel.svelte`: 2776
- `src/routes/passport/+page.svelte`: 2689
- `src/routes/cogochi/scanner/+page.svelte`: 1635
- `src/routes/terminal/+page.svelte`: 1596
- `src/lib/engine/v2BattleEngine.ts`: 1501
- `src/components/arena/Lobby.svelte`: 1456
- `src/routes/cogochi/terminal/+page.svelte`: 1454

### Structural signals

- `src/routes`: 166 files
- `src/components`: 121 files
- `src/lib`: 245 files
- there is no meaningful live `features/<surface>/controllers/components` structure yet
- only a small `src/lib/services/*` layer exists, so most orchestration is still trapped in route or component files

### Active overlap risk

- current dirty branch work already touches `Header`, `Home`, top-level layout, tokens, and `AlphaMarketBar`
- `safe:sync` is currently blocked by pre-existing uncommitted changes
- the repo therefore needs a design that separates trunk refactor work from the current WIP rather than mixing them blindly

## Non-Negotiable Invariants

1. No full rewrite.
2. Existing user WIP on `codex/terminal-wip-sync-20260410` must not be overwritten.
3. `priceStore` remains the only canonical client owner of live market truth.
4. Durable profile, signal, trade, learning, and position domains remain server-authoritative.
5. Route files own entry, exit, and composition only.
6. New terminal or cogochi UI density must not be added directly into god-route shells.
7. `terminal`, `terminal-legacy`, `cogochi/terminal`, and `cogochi/scanner` must converge toward one terminal architecture rather than continue as parallel products.
8. Canonical docs and shipped route map must converge during the refactor, not after it.

## Primary Failure Modes

### F1. Route shells are still mixed-concern god files

The repo still places layout, orchestration, subscriptions, persistence, and view logic in the same files:

- `src/routes/arena/+page.svelte`
- `src/routes/terminal/+page.svelte`
- `src/routes/terminal-legacy/+page.svelte`
- `src/routes/passport/+page.svelte`
- `src/routes/cogochi/terminal/+page.svelte`
- `src/routes/cogochi/scanner/+page.svelte`

### F2. The app has two overlapping terminal systems

Current route inventory shows all of these are live or semi-live concepts:

- `/terminal`
- `/terminal-legacy`
- `/scanner`
- `/cogochi/terminal`
- `/cogochi/scanner`

This prevents stable ownership, makes QA ambiguous, and encourages duplicated UI logic.

### F3. Shared global surfaces are being upgraded before the underlying authority map is fully repaired

The current branch already moves Alpha Flow signals into:

- `src/components/layout/Header.svelte`
- `src/components/cogochi/AlphaMarketBar.svelte`
- `src/routes/+layout.svelte`
- `src/routes/+page.svelte`

That direction is reasonable, but without stronger boundaries the header and home routes become another integration sink.

### F4. State authority is documented better than it is implemented

The canonical docs are clear:

- `priceStore` should be the live-price owner
- `gameState` should remain transient
- profile and trade stores should be server projections

But the codebase still carries too much orchestration and hydration logic in the UI layer.

### F5. Surface model drift is still too high

Canonical product intent says the main builder loop is:

`Home -> Onboard -> Dashboard -> Terminal (optional) -> Lab -> Battle -> Agent`

But the route map still exposes overlapping legacy surfaces such as:

- `/arena`
- `/arena-v2`
- `/arena-war`
- `/passport`
- `/agents`
- `/oracle`
- `/terminal-legacy`

This creates permanent product and implementation ambiguity.

## Target End State

By the end of this refactor program:

1. each primary surface has one canonical route and one canonical controller boundary
2. terminal and cogochi analysis experiences share one architecture, even if some views remain branded differently
3. heavy route shells are reduced to composition files
4. global header and home surfaces consume projections instead of orchestrating domain logic
5. client stores are clearly split into canonical client truth, server projections, and route-local transient state
6. prototype or duplicate routes are demoted, redirected, or archived
7. active docs describe the shipped route map without caveats

## Target Architecture

### A. Surface ownership

- `src/routes/**/+page.svelte`
  - entry, load data wiring, top-level composition, and route-only navigation rules
- `src/lib/features/<surface>/controllers/**`
  - async orchestration, subscriptions, mutation coordination, responsive behavior decisions
- `src/lib/features/<surface>/components/**`
  - pure surface presentation components
- `src/lib/features/<surface>/adapters/**`
  - route-specific view-model shaping and compatibility shims
- `src/lib/services/**`
  - shared infra such as live price sync, scan fetch, and side-effect helpers
- `src/lib/server/**` and `src/routes/api/**`
  - durable server authority only

### B. Terminal convergence model

Use one terminal domain with layered entry points instead of parallel implementations:

- canonical surface: `/terminal`
- compatibility redirect or bridge: `/scanner`
- migration-only shell: `/terminal-legacy`
- cogochi-branded variants must become wrappers over the same controller and presentation modules, not separate route engines

This means the terminal refactor is no longer just a `/terminal` task. It is a convergence task across:

- `src/routes/terminal/+page.svelte`
- `src/routes/terminal-legacy/+page.svelte`
- `src/routes/cogochi/terminal/+page.svelte`
- `src/routes/cogochi/scanner/+page.svelte`
- `src/components/terminal/**`
- `src/components/cogochi/**`

### C. Arena split model

Arena work should converge around one proof path:

- canonical proof route: `/battle` or `/arena`, but not both as long-term peers
- `arena-v2` and `arena-war` remain either experimental shells or get folded into the selected proof path
- `ChartPanel.svelte` becomes a coordinator over extracted chart core, overlays, indicators, and runtime bindings

### D. Global shell model

`Header`, root layout, and home should consume small projections:

- market summary projection
- alpha bucket summary projection
- navigation state projection

They must not own polling policy, scan orchestration, or surface-specific mutation logic.

## Workstreams

### W1. Branch and ownership hygiene

Purpose:
- stop current dirty WIP from contaminating the trunk refactor

Includes:
- split current shared WIP into explicit slices before implementation begins
- keep repo-wide refactor work in documentation and isolated branches until shared files are stabilized
- use `safe:sync` and `safe:split` as mandatory entry points for implementation slices

Exit criteria:
- shared files such as `Header`, `+layout`, `+page`, and `AlphaMarketBar` have a clear owner per slice

### W2. Route-shell decomposition

Purpose:
- remove the biggest review and regression bottleneck first

Priority order:

1. `src/routes/terminal-legacy/+page.svelte`
2. `src/routes/arena/+page.svelte`
3. `src/routes/passport/+page.svelte`
4. `src/routes/cogochi/scanner/+page.svelte`
5. `src/routes/cogochi/terminal/+page.svelte`
6. `src/routes/terminal/+page.svelte`

Exit criteria:
- route files become shells
- orchestration moves into controllers
- presentation is no longer mixed with subscriptions and persistence

### W3. State-authority repair

Purpose:
- make structural refactors stick by fixing the ownership layer beneath them

Priority domains:

1. `priceStore` and all live-price consumers
2. `gameState` and route-local arena state
3. `userProfileStore`
4. `quickTradeStore`
5. `trackedSignalStore`
6. `copyTradeStore`
7. hydration and local persistence helpers

Exit criteria:
- live market truth stops fanning through unrelated stores
- optimistic client flows reconcile by stable server identities
- local persistence is cache or staging only

### W4. Terminal plus cogochi convergence

Purpose:
- prevent the repo from carrying two terminal products forever

Includes:
- extract one shared scan/intel/chat controller layer
- separate generic terminal primitives from cogochi-branded presentation
- define which route becomes canonical and which routes become redirects or wrappers
- keep Alpha Flow density work on top of the new controller boundary, not inside legacy shells

Exit criteria:
- one controller stack serves the terminal domain
- duplicate route engines are removed or explicitly transitional

### W5. Arena and proof-path consolidation

Purpose:
- align route reality with the product thesis

Includes:
- select the long-term canonical proof route
- demote or wrap `arena-v2` and `arena-war`
- shrink `ChartPanel.svelte`
- isolate battle-mode differences behind smaller adapters

Exit criteria:
- docs and runtime use one clear proof path

### W6. Surface reduction and documentation convergence

Purpose:
- finish the refactor by reducing conceptual load

Includes:
- decide the canonical profile or agent destination across `/passport`, `/agent`, and `/agents`
- clean up route-map drift and redirect shims
- promote stable design decisions back into canonical docs

Exit criteria:
- active docs describe the actual shipped surface map
- duplicated route concepts are no longer first-class

## Execution Order

### Phase 0. Freeze and measure

Do first.

1. capture the current hotspot list, warning budget, and route overlap map
2. avoid new implementation on shared dirty files until current WIP is either committed or split
3. keep this plan as the trunk design reference

### Phase 1. Isolate current WIP from trunk refactor

1. split the active `Header` and `Home` WIP into a dedicated implementation slice
2. keep repo-wide refactor changes branch-local and documentation-first until shared files are clean
3. require `safe:sync` success before new code slices start

### Phase 2. Decompose the heaviest route shells

1. `terminal-legacy`
2. `arena`
3. `passport`
4. `cogochi/scanner`

Why this order:

- line count is extreme
- they block multiple other surfaces
- they keep spawning coupling and warning debt

### Phase 3. Repair state authority under the split shells

1. live-price ownership
2. server-projection stores
3. hydration and persistence adapters

This phase follows decomposition closely so controllers do not inherit the old authority mistakes.

### Phase 4. Converge terminal systems

1. select canonical terminal route ownership
2. turn remaining terminal-like routes into wrappers, redirects, or branded skins
3. place Alpha Flow features on shared controllers and reusable presentation modules

### Phase 5. Converge proof and profile surfaces

1. pick the canonical proof route
2. pick the canonical profile or agent management route
3. demote secondary surfaces to explicit compatibility status

### Phase 6. Ratchet quality

1. warning budget by surface
2. file-size budget for route shells and hot components
3. doc update gate whenever surface ownership changes

## Do Not Mix

The following should not be mixed into the first implementation batches:

- broad visual redesign outside currently touched surfaces
- engine or API redesign while route decomposition is still incomplete
- archive cleanup that is unrelated to canonical route reduction
- global header embellishment that adds more polling or orchestration
- new legacy wrappers created for convenience instead of migration

## Success Metrics

### Structural metrics

- no primary route shell above an agreed reviewable size threshold
- no new top-level surface introduced without a canonical doc update
- shared controller folders exist for terminal and arena domains

### Authority metrics

- `priceStore` has no hidden mirror owner
- projection stores can rebuild from server truth without semantic loss
- `dbStore` and local persistence utilities are clearly cache-only or deprecated

### Surface metrics

- one canonical terminal route
- one canonical proof route
- one canonical agent or profile management route
- route map and system intent no longer contradict the shipped app

## Immediate Next Slices

1. stabilize and commit the current `Header` and `Home` plus `AlphaMarketBar` WIP on its own branch slice
2. create the first implementation refactor slice for `terminal-legacy` decomposition
3. create the second implementation slice for `arena` plus `ChartPanel` decomposition
4. only after those are moving cleanly, start the terminal plus cogochi convergence slice
