# ADR-002: App-Engine Boundary

## Status

Accepted

## Decision

`app/` is responsible for surface rendering and orchestration; `engine/` is responsible for domain logic and evaluation semantics.

## Consequences

- `engine/` must not depend on UI state.
- `app/` routes call engine interfaces via contracts.
- Boundary violations are treated as architecture regressions.
