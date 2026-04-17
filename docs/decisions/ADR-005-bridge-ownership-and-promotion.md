# ADR-005: Bridge Ownership and Promotion

## Status

Accepted

## Context

The app-engine boundary has been reduced to a small set of intentional bridge files. They are no longer accidental boundary leaks; they are explicit translation points.

Those bridge files do not all have the same long-term destination:

- some are product-surface helpers that should remain app-owned
- some are engine/runtime adapters that should stay thin until engine runtime moves behind `engine-api`
- some are transitional facades that already expose app contracts but still call local engine TypeScript

Without classifying them now, later work can make the wrong move:

- copying engine semantics into app
- over-generalizing product UI helpers into backend truth
- deleting a useful facade before an API/runtime replacement exists

## Decision

Bridge files are classified as follows.

### 1. App-owned product bridges

These may continue to live under `app/src/lib` and can eventually stop importing local engine modules entirely if their implementation is copied or rewritten inside app.

- `app/src/lib/lab/backtest.ts`
  - app-owned lab/product execution surface
  - deterministic local tooling for research UX
  - if moved later, it should move because lab runtime architecture changes, not because engine semantics require it

- `app/src/lib/agents/definitions.ts`
  - app-owned presentation bridge
  - feeds UI metadata and agent catalog rendering
  - may later become a pure app contract/module if frontend metadata diverges from engine internals

### 2. Engine-owned runtime bridges

These should remain thin wrappers until their implementation is served by `engine-api` or another engine-owned runtime surface.

- `app/src/lib/server/research/v4Battle.ts`
  - wraps battle execution semantics
  - battle state machine remains engine truth

- `app/src/lib/server/rag/embedding.ts`
  - wraps deterministic embedding/hash semantics used by engine-style memory logic
  - should become an engine utility/API surface, not an app-owned rules module

- `app/src/lib/server/opportunity/scanner.ts`
  - wraps opportunity scoring/extraction logic
  - scanner semantics belong with engine compute, even if public orchestration stays on app-web

### 3. Transitional app-contract facades

These already expose app-facing contracts and should remain as facades until an engine runtime/API replacement exists. Do not inline their engine implementation back into routes or stores.

- `app/src/lib/server/cogochi/signalSnapshot.ts`
  - app-facing contract is correct
  - underlying signal computation remains engine semantics

- `app/src/lib/server/douni/personality.ts`
  - app-facing prompt/profile contract is correct
  - underlying personality builder may stay local until DOUNI runtime is re-homed deliberately

## Promotion Rules

Future work must follow these rules:

1. Routes, stores, and components must import contracts or bridge files, never raw engine modules.
2. App-owned product bridges may absorb implementation only if that implementation is presentation/tooling logic and not engine truth.
3. Engine-owned runtime bridges must stay thin; if their logic grows, move it toward `engine-api` rather than deeper into app.
4. Transitional facades may add contract casting, validation, and shape normalization, but not duplicate engine semantics.
5. Any new bridge file must be classified into one of the three groups above in its work item before expansion.

## Consequences

- Future refactors can distinguish "remove bridge" from "promote bridge" correctly.
- App surface teams have a safe place to evolve lab/UI tooling without re-opening engine boundary violations.
- Engine semantics remain centralized even while TypeScript runtime wrappers still exist locally.
- The next migration step is runtime relocation, not more type-path cleanup.
