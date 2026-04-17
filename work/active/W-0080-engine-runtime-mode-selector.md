# W-0080 Engine Runtime Mode Selector

## Goal
Turn the new engine-runtime adapter layer into an explicit execution-mode boundary for core-loop engine compute.

## Scope
- Add a shared runtime mode selector for engine-owned runtime adapters.
- Route opportunity scanner, RAG embedding, and v4 battle adapters through explicit `local | remote` dispatch.
- Fail closed for unsupported remote transports.

## Non-Goals
- No live HTTP transport implementation in this slice.
- No engine-api schema generation for these domains yet.
- No runtime behavior change in default local mode.

## Canonical Files
- `app/src/lib/server/engine-runtime/config.ts`
- `app/src/lib/server/engine-runtime/opportunity.ts`
- `app/src/lib/server/engine-runtime/rag.ts`
- `app/src/lib/server/engine-runtime/v4Battle.ts`
- `app/src/lib/server/engine-runtime/local/*`
- `docs/decisions/ADR-006-core-loop-runtime-adapter-boundary.md`

## Facts
- The adapter layer exists, but current dispatch is still implicitly local.
- A shared runtime selector now exists in `app/src/lib/server/engine-runtime/config.ts`.
- ADR-004 requires engine compute to move behind `engine-api` over time.
- Opportunity scanner, RAG embedding, and v4 battle do not yet have engine-api transports.

## Assumptions
- A fail-closed remote mode is better than silent local fallback when operators intend runtime separation.

## Open Questions
- Should future remote transport config be global or per-domain once engine-api coverage diverges?

## Decisions
- Add a shared `ENGINE_RUNTIME_MODE` selector with default `local`.
- Remote mode must throw clear unsupported errors until a domain transport exists.

## Next Steps
- Implement the first real remote transport for one engine-owned runtime domain.

## Exit Criteria
- Engine-owned runtime adapters dispatch through explicit mode selection. Met.
- Unsupported remote mode fails clearly instead of silently using local engine code. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Next transport implementation slice can attach remote handlers without changing callers.
