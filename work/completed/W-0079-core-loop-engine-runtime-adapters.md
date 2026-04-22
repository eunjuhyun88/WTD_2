# W-0079 Core Loop Engine Runtime Adapters

## Goal
Enforce a single adapter boundary for engine-owned runtime bridges used by the Day-1 core loop.

## Scope
- Add `app/src/lib/server/engine-runtime/*` adapters for engine-owned runtime bridges.
- Move opportunity scanner, RAG embedding, and v4 battle wrappers to those adapters.
- Publish an ADR that fixes this adapter boundary as the only allowed local engine runtime import point on app-web.

## Non-Goals
- No engine-api HTTP transport in this slice.
- No runtime behavior change.
- No app-owned product bridge migration (`lab/backtest`, `agents/definitions`) in this slice.

## Canonical Files
- `docs/decisions/ADR-006-core-loop-runtime-adapter-boundary.md`
- `app/src/lib/server/engine-runtime/opportunity.ts`
- `app/src/lib/server/engine-runtime/rag.ts`
- `app/src/lib/server/engine-runtime/v4Battle.ts`
- `app/src/lib/server/engine-runtime/local/opportunity.ts`
- `app/src/lib/server/engine-runtime/local/rag.ts`
- `app/src/lib/server/engine-runtime/local/v4Battle.ts`
- `app/src/lib/server/opportunity/scanner.ts`
- `app/src/lib/server/rag/embedding.ts`
- `app/src/lib/server/research/v4Battle.ts`

## Facts
- The remaining engine-owned runtime bridges are `opportunity/scanner`, `rag/embedding`, and `research/v4Battle`.
- These bridges now import adapter modules under `app/src/lib/server/engine-runtime/*`.
- The runtime split in ADR-004 says engine compute should ultimately live behind `engine-api`.

## Assumptions
- A local adapter layer is the correct intermediate step before HTTP engine-api transport exists.

## Open Questions
- Should the future engine-api client use one shared generated transport package or per-domain clients?

## Decisions
- Only `app/src/lib/server/engine-runtime/local/*` may import local engine runtime implementation for engine-owned bridges.
- Bridge files above that layer must import adapters, not engine modules.

## Next Steps
- Continue with `engine-api` transport replacement inside adapters when runtime routes exist.

## Exit Criteria
- `server/opportunity/scanner.ts`, `server/rag/embedding.ts`, and `server/research/v4Battle.ts` no longer import `$lib/engine/*` directly. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Future engine-api migration work references ADR-006.
