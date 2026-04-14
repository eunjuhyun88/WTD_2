# ADR-003: Challenge Contract as Integration Spine

## Status

Accepted

## Decision

Challenge creation, evaluation requests, and result payloads must use explicit request/response contracts documented in one canonical contract surface.

## Consequences

- Contract changes require versioned update notes and compatibility checks.
- Routes and engine adapters validate payload shapes.
- Work items that touch contracts must include sample payloads.
