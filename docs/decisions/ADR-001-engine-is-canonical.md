# ADR-001: Engine Is Canonical Backend Truth

## Status

Accepted

## Decision

All backend market logic, feature computation, and evaluation logic are authoritative only in `engine/`.

## Consequences

- App code cannot duplicate engine business logic.
- Backend truth updates occur in `engine/` first.
- Interface updates are exposed through contracts.
