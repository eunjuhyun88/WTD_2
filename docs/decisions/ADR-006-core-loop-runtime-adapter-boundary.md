# ADR-006: Core Loop Runtime Adapter Boundary

## Status

Accepted

## Context

ADR-004 fixes the long-term runtime split:

- `app-web` for surface and orchestration
- `engine-api` for engine compute truth
- `worker-control` for background execution

ADR-005 classifies several remaining bridge files as engine-owned runtime bridges:

- opportunity scanner
- RAG embedding/hash helpers
- v4 battle execution

Those bridges were already isolated logically, but they still imported local engine TypeScript directly from app-web code. That is acceptable only as a temporary local-runtime fallback. Without a stricter adapter boundary, future work can easily reintroduce engine implementation imports into routes and services.

## Decision

Adopt a two-layer runtime adapter rule for engine-owned runtime bridges on app-web:

1. Public app-web bridge layer
   - path: `app/src/lib/server/<domain>/*` or equivalent facade
   - imports only:
     - app contracts
     - adapter modules under `app/src/lib/server/engine-runtime/*`
   - must not import local engine runtime modules directly

2. Runtime adapter implementation layer
   - path: `app/src/lib/server/engine-runtime/local/*`
   - may import local engine TypeScript runtime implementations
   - exists only as the temporary local-runtime fallback until `engine-api` transport replaces it

Adapter selector modules under `app/src/lib/server/engine-runtime/*` are the only stable import point for engine-owned runtime execution from app-web.

Execution mode is explicit:

- `ENGINE_RUNTIME_MODE=local`
  - use local TypeScript engine fallback via `engine-runtime/local/*`
- `ENGINE_RUNTIME_MODE=remote`
  - must use an implemented `engine-api` transport
  - unsupported domains fail closed and must not silently fall back to local compute

First implemented remote transport:

- `opportunity scanner`
  - initial remote mode used `engine-api /universe` as the authoritative seed-candidate source
  - current remote mode uses dedicated `engine-api /opportunity/run`
  - local app mode remains as fallback, but remote mode no longer composes the score in app-web
  - this is an intentional transitional split; richer social/macro/onchain overlays may still converge later

## Consequences

- Routes and services above the adapter layer stay transport-agnostic.
- Replacing local engine TypeScript with HTTP `engine-api` calls becomes a leaf change inside adapters instead of a route-by-route rewrite.
- New engine-owned runtime bridges must follow the same pattern instead of importing `$lib/engine/*` directly.
- Operators can intentionally force separation pressure with `ENGINE_RUNTIME_MODE=remote` and immediately detect missing engine-api coverage.
- Remote coverage can advance incrementally by splitting candidate acquisition from app-owned overlay logic instead of waiting for a full one-shot backend rewrite.
- App-owned product bridges such as `lab/backtest` and `agents/definitions` are not covered by this ADR; ADR-005 still governs their ownership.
