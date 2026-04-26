# Current Architecture

**Status:** current
**Verified by:** `./tools/verify_design.sh`
**Updated:** 2026-04-26

## Boundaries

- `engine/` is the backend truth for Python runtime, stores, feature logic, pattern search, and scheduled jobs.
- `app/` is product surface and orchestration. It may call engine HTTP/API contracts but must not import Python engine modules from Svelte.
- `memory/` is the single repo-wide MemKraft store. No app-local or nested MemKraft roots are allowed.
- `state/` is generated derived state. Humans and agents do not edit it as truth.
- `spec/` contains current operating intent: priorities, file-domain locks, and W-number index.
- `design/current/` contains verifiable current specs. It must fail CI when code drifts from the documented invariants.

## Verification Model

Design docs are not accepted as truth by themselves. Every current design assertion that can be checked should be represented in `design/current/invariants.yml` and enforced by `tools/verify_design.sh`.

## Current Gates

- MemKraft wrapper and root layout are enforced.
- ChartBoard core prop contract is checked against `ChartBoard.svelte`.
- App/engine import boundaries are checked.
- Cogochi API routes are checked against the server hook auth policy.
