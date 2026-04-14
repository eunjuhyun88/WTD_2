# Canonical Frontend Refactor Plan

Date: 2026-03-06  
Status: active  
Scope: `/Users/ej/Downloads/wtd-clones/frontend`
Assumption: `frontend/` is the only canonical implementation target. `backend/` is reference-only.

## Goal

Turn `frontend/` into the single clean full-stack app by fixing:

1. clone drift
2. frontend/backend responsibility overflow
3. server authority gaps
4. terminal/chart hotspot complexity
5. API guard inconsistency

This plan is for execution order, not for broad redesign.

## Canonical Inputs

- [`docs/references/active/clone-consolidation-audit-2026-03-06.md`](../../references/active/clone-consolidation-audit-2026-03-06.md)
- [`docs/references/active/frontend-backend-boundary-map-2026-03-06.md`](../../references/active/frontend-backend-boundary-map-2026-03-06.md)
- [`docs/references/active/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md`](../../references/active/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md)
- [`docs/API_CONTRACT.md`](../../API_CONTRACT.md)
- [`docs/references/active/BACKEND_SECURITY_REVIEW_2026-02-25.md`](../../references/active/BACKEND_SECURITY_REVIEW_2026-02-25.md)

## Invariants

1. New implementation work happens only in `frontend/`.
2. `backend/` is never treated as a second live implementation target.
3. Same-path drift is merged by narrow 3-way diff, never by folder overwrite.
4. `src/routes/api/**/+server.ts` and `src/lib/server/**` remain the only server truth boundary.
5. `src/lib/stores/**` may cache and stage, but must not become long-term authority.

## Problem Statement

The repo is not failing because SvelteKit is full-stack. It is failing because the full-stack boundary is not enforced consistently.

Current failure modes:

- duplicated clone history created drift
- stores still carry too much domain truth
- large terminal/chart surfaces still own too much orchestration
- API handlers do not follow one request/guard/mutation standard
- refactor work is happening, but without one top-level execution order

## Target End State

By the end of this plan:

1. `frontend/` is the only active app.
2. `backend/` is archived or treated as read-only reference.
3. profile, agent stats, quick trade, and tracked signal flows are server-authoritative.
4. terminal and chart heavy files are split into shell, orchestration, and presentation layers.
5. mutation APIs use shared body guards and abuse guards consistently.
6. large client surfaces no longer mix layout, polling, persistence, and domain control in one file.

## Workstreams

### W1. Clone Consolidation

Purpose:
- remove ambiguity about which folder is real

Includes:
- freeze `backend/` as reference-only
- compare same-path drift files
- archive dead backend-only leftovers

Primary files:
- `backend/` reference tree
- `docs/references/active/clone-consolidation-audit-2026-03-06.md`

Done when:
- no new tasks target `backend/`
- all P0 drift files are manually classified

### W2. Server Authority Repair

Purpose:
- move domain truth back to the server

Includes:
- profile projection and profile stats authority
- agent stats authority cleanup
- quick trade / tracked signal idempotency and hydration cleanup

Primary files:
- [`src/lib/stores/userProfileStore.ts`](../../../src/lib/stores/userProfileStore.ts)
- [`src/lib/stores/agentData.ts`](../../../src/lib/stores/agentData.ts)
- [`src/lib/stores/quickTradeStore.ts`](../../../src/lib/stores/quickTradeStore.ts)
- [`src/lib/stores/trackedSignalStore.ts`](../../../src/lib/stores/trackedSignalStore.ts)
- [`src/routes/api/profile/+server.ts`](../../../src/routes/api/profile/+server.ts)
- [`src/routes/api/quick-trades/open/+server.ts`](../../../src/routes/api/quick-trades/open/+server.ts)
- [`src/routes/api/quick-trades/[id]/close/+server.ts`](../../../src/routes/api/quick-trades/[id]/close/+server.ts)
- [`src/routes/api/signals/track/+server.ts`](../../../src/routes/api/signals/track/+server.ts)
- [`src/routes/api/copy-trades/publish/+server.ts`](../../../src/routes/api/copy-trades/publish/+server.ts)

Done when:
- stores are projection/cache oriented
- optimistic flows reconcile by stable mutation identity
- local fuzzy duplicate logic is removed or minimized

### W3. API Contract and Security Standardization

Purpose:
- make server mutation handling predictable and safe

Includes:
- replace raw `request.json()` usage on write routes
- standardize `readJsonBodySafely` / `readJsonBody`
- standardize `runIpRateLimitGuard` coverage for high-cost endpoints
- reduce inconsistent response contracts on critical paths

Primary files:
- [`src/lib/server/requestGuards.ts`](../../../src/lib/server/requestGuards.ts)
- [`src/lib/server/authSecurity.ts`](../../../src/lib/server/authSecurity.ts)
- `src/routes/api/**/*`

Highest-priority handler groups:
- `quick-trades/*`
- `signals/*`
- `copy-trades/*`
- `chat/messages`
- `community/posts`
- `terminal/*`
- `market/snapshot`

Done when:
- all high-cost write routes use shared request guard helpers
- all exposed expensive routes have abuse guard coverage

### W4. Terminal Orchestration Split

Purpose:
- stop terminal files from acting like god-objects

Includes:
- route shell owns viewport/layout only
- panel view models own fetch orchestration
- presentation components stop polling directly

Primary files:
- [`src/routes/terminal/+page.svelte`](../../../src/routes/terminal/+page.svelte)
- [`src/components/terminal/IntelPanel.svelte`](../../../src/components/terminal/IntelPanel.svelte)
- [`src/components/terminal/WarRoom.svelte`](../../../src/components/terminal/WarRoom.svelte)
- [`src/components/terminal/terminalViewModel.ts`](../../../src/components/terminal/terminalViewModel.ts)
- [`src/components/terminal/intelViewModel.ts`](../../../src/components/terminal/intelViewModel.ts)

Done when:
- terminal route shell loses fetch and mutation ownership
- IntelPanel loses direct multi-endpoint orchestration
- WarRoom loses mixed persistence + control + fetch ownership

### W5. Chart / Arena Performance Split

Purpose:
- reduce regression surface and runtime churn

Includes:
- continue ChartPanel decomposition
- isolate chart core, indicator engine, overlay renderer, runtime bindings
- reduce arena route responsibilities after chart boundary is stable

Primary files:
- [`src/components/arena/ChartPanel.svelte`](../../../src/components/arena/ChartPanel.svelte)
- `src/components/arena/chart/*`
- [`src/routes/arena/+page.svelte`](../../../src/routes/arena/+page.svelte)

Done when:
- ChartPanel only coordinates and renders
- runtime and drawing concerns are outside the component
- arena route no longer owns unrelated chart internals

### W6. Archive and Cleanup

Purpose:
- remove dead paths after authority and orchestration are stabilized

Includes:
- classify backend-only leftovers
- archive dead prototypes
- keep only canonical documentation and active plan surfaces

Done when:
- dead backend-only files are either archived or explicitly ignored
- no implementation plan still points engineers back to `backend/`

## Execution Order

### Phase 0. Lock Canonical Boundary

Purpose:
- stop further drift before code refactors continue

Steps:
1. treat `backend/` as frozen reference-only
2. keep all new work in `frontend/`
3. use the clone audit and boundary map as routing docs

Exit criteria:
- all new planning docs reference `frontend/` only

### Phase 1. P0 Drift Merge

Purpose:
- reconcile the most dangerous same-path differences first

Order:
1. `src/lib/server/requestGuards.ts`
2. `src/routes/api/copy-trades/publish/+server.ts`
3. `src/routes/api/quick-trades/open/+server.ts`
4. `src/routes/api/quick-trades/[id]/close/+server.ts`
5. `src/routes/api/signals/track/+server.ts`
6. `src/routes/api/profile/+server.ts`
7. `src/lib/server/scanEngine.ts`
8. `src/lib/server/db.ts`

Exit criteria:
- all P0 files have explicit frontend-base decisions
- no P0 file still requires blind backend comparison during future work

### Phase 2. Server Authority Repair

Purpose:
- reduce client truth and eliminate local/server divergence

Order:
1. `userProfileStore.ts`
2. `agentData.ts`
3. `quickTradeStore.ts`
4. `trackedSignalStore.ts`

Exit criteria:
- localStorage is cache only
- client optimistic state always converges through server IDs/contracts

### Phase 3. API Guard Standardization

Purpose:
- align mutation endpoints around one safe pattern

Order:
1. `quick-trades/*`
2. `signals/*`
3. `copy-trades/*`
4. `chat/messages`
5. `community/posts`
6. `terminal/*`
7. remaining write endpoints still on raw `request.json()`

Exit criteria:
- high-risk write handlers all use shared request/body guard helpers

### Phase 4. Terminal Boundary Split

Purpose:
- reduce complexity in the heaviest UI shell after server contracts are stable

Order:
1. `IntelPanel.svelte`
2. `WarRoom.svelte`
3. `terminal/+page.svelte`

Exit criteria:
- data orchestration moves into view-model or scheduler modules
- layout shells become mostly composition and event wiring

### Phase 5. Chart / Arena Boundary Split

Purpose:
- finish the hotspot decomposition once terminal and authority work are stable

Order:
1. remaining `ChartPanel` runtime ownership
2. overlay / pattern / planner isolation
3. `arena/+page.svelte` controller cleanup

Exit criteria:
- chart runtime paths are isolated
- arena route is no longer carrying chart internals

### Phase 6. Archive and Hard Cleanup

Purpose:
- finish the organizational cleanup

Steps:
1. archive backend-only dead files
2. update active docs to point only to canonical surfaces
3. move completed plans when execution ends

Exit criteria:
- the repo has one obvious implementation target

## Risk Register

### R1. Overlap With Active UI Work

Risk:
- `frontend` already has a dirty worktree and multiple active UI refactors

Mitigation:
- start with server files and docs
- avoid large overwrites on active terminal/chart files

### R2. Hidden Behavior Coupling

Risk:
- store cleanup can silently break optimistic UX

Mitigation:
- refactor one domain store at a time
- preserve response contracts while authority moves server-side

### R3. Full-Stack But Not Service-Separated

Risk:
- developers may still assume `backend/` is a live server app

Mitigation:
- keep repeating the runtime boundary rule in docs and plans

## Validation Discipline

For each implementation slice:

1. `npm run check`
2. `npm run build`
3. targeted manual contract review for touched API/store paths

For doc-only slices:

- no runtime validation required unless code changed

## Definition of Done

This folder refactor is complete when:

1. `frontend/` is the uncontested canonical app.
2. `backend/` is no longer part of active implementation flow.
3. profile/agent/trade/signal domains are server-authoritative.
4. terminal and chart hotspots are split by responsibility.
5. critical mutation APIs use shared guards consistently.
6. the next engineer can tell what is frontend, backend, and boundary-critical without re-discovering it from code.

## Immediate Next Slice

If work starts now, the next slice should be:

1. `src/lib/server/requestGuards.ts`
2. `src/routes/api/copy-trades/publish/+server.ts`
3. `src/routes/api/quick-trades/open/+server.ts`
4. `src/routes/api/quick-trades/[id]/close/+server.ts`

This is the highest-leverage entry because it reduces clone drift, server contract drift, and client/server reconciliation bugs at the same time.
