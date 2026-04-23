# 0004: CTO Data Engine Reset — 2026-04-23

## Status

Accepted — execution order and first refactor slice approved

## Context

The repository currently runs two overlapping data architectures:

1. `engine` owns pattern runtime, replay, scan, capture, verdict, refinement, and worker-control.
2. `app` still owns a large market fact assembly surface via `/api/market/*`, `marketSnapshotService`, and direct upstream fan-out.

This produces four structural failures:

- truth is split between `engine` and `app`
- durable state is split across Postgres, Supabase mirror, SQLite, JSON files, CSV cache, and in-memory caches
- work-item docs describe fact/search/surface planes that the current checkout does not fully implement
- merge readiness is being inferred from branch existence instead of plane purity

## Current-State Inventory

### App-Owned Fact Assembly

The following remain app-owned today:

- `/api/market/*` routes
- `marketDataService.ts` fetch primitives
- `marketFeedService.ts` derivatives/news composition
- `marketSnapshotService.ts` snapshot assembly + DB persistence to `market_snapshots` and `indicator_series`

This is useful product code, but it violates the repo rule that `engine/` is the only backend truth.

### Engine-Owned Runtime

The following are already correctly engine-owned:

- pattern runtime and replay
- scanner and worker-control jobs
- capture and verdict lanes
- ledger/outcome logic
- research state and refinement orchestration

### Storage Reality

Current persistent storage is split:

- app Postgres: terminal/session/snapshot tables
- Supabase: alerts and some mirrored/shared records
- engine SQLite: captures, pattern runtime state, research state
- engine JSON/file: ledger fallback
- engine CSV cache: market raw cache

This is acceptable for dev fallback, but not for production truth.

## Decision

The system is reset into four layers.

### 1. Canonical Fact Plane

Owner: `engine`

Responsibilities:

- collect raw provider data
- normalize source payloads
- publish bounded read models for surfaces and AI

Allowed persistence:

- shared Postgres/Supabase canonical tables
- Redis hot cache
- local cache only as fallback

### 2. Canonical Search Plane

Owner: `engine` + `worker-control`

Responsibilities:

- corpus accumulation
- replay/search candidate generation
- pattern catalog and family stats
- research memory and refinement evidence

### 3. Canonical Runtime State

Owner: `engine`

Responsibilities:

- captures
- pattern states
- phase transitions
- ledger records
- outcomes/verdicts

Long-term target: shared Postgres/Supabase, not local SQLite.

### 4. Surface Plane

Owner: `app`

Responsibilities:

- terminal UI
- analyze workspace
- compare/pin flow
- auth/session/fallback UX

Constraint:

- app reads engine-owned bounded read models
- app must not be the long-term owner of raw provider fan-out

## Merge Queue

### Merge Now

- none

No currently preserved parking branch is safe to merge directly.

### Split Next

- `W-0122` fact-plane extraction from clean branches
- `W-0145` corpus accumulation lane
- `W-0143` seed-search / pattern-catalog / AI context extraction
- `W-0142` research-context contract once lane-pure

### Park Only

- `codex/parking-20260423-mixed-lanes`
- `codex/stack-20260423-mixed-terminal-stack`

These branches are recovery assets only.

## Branch Actions

### `codex/w-0148-data-engine-reset`

- role: CTO reset lane
- keep scope limited to:
  - architecture decision docs
  - branch/merge queue
  - bounded engine fact-plane landing zone
- next commit split:
  - `docs(W-0148): accept CTO data engine reset`
  - `feat(engine): add bounded fact-context read model`

### `codex/w-0122-fact-plane-mainline`

- role: clean fact-plane execution lane
- action: continue here after `W-0148`
- merge rule: only fact-plane files and tests

### `codex/parking-20260423-mixed-lanes`

- role: extraction source only
- direct merge: forbidden
- extraction targets:
  - `9e16b174` -> `W-0142` clean contract branch
  - `6c0acf44` -> `W-0142` app persistence branch or follow-up
  - `b05b32fa` -> `W-0143` engine search lane
  - `dde40822` -> `W-0143` app/agent context lane
  - `6b9eae08` + `939cfe53` -> `W-0144` memory lane
  - `b4abf9de` -> only extract if `W-0139` is explicitly reopened

### `codex/stack-20260423-mixed-terminal-stack`

- role: historical recovery only
- action: preserve, do not develop, do not merge

## Commit Discipline

- one lane, one commit family, one PR
- no more mixed commits spanning fact/search/surface in the same branch
- docs-only governance changes may sit with `W-0148`, but code movement after this point must return to lane-specific branches

## Execution Order

1. open engine-owned bounded fact read model
2. finish fact-plane cleanup in `W-0122`
3. move search-plane accumulation to scheduler-owned corpus storage
4. migrate app consumers from direct provider fan-out to engine read models
5. migrate engine local runtime stores to shared canonical storage

## First Refactor Slice

The first slice in this decision is:

- add an engine-owned bounded fact-context route
- keep it backed by current engine loaders/caches
- use it as the landing zone for later app cutover

This is intentionally transitional, but it moves the ownership boundary in the correct direction without requiring a flag day rewrite.
