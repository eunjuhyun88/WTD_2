# W-0066 RAG Server Boundary

## Goal
Hide RAG embedding and arena memory types behind app server/contracts boundaries.

## Scope
- Add app contract types for RAG service inputs/outputs used by app server.
- Add a server facade for RAG embedding helpers.
- Update terminal scan route and RAG service imports.

## Non-Goals
- No embedding algorithm changes.
- No RAG database schema or SQL changes.
- No arena/v4 gameplay migration.

## Canonical Files
- `app/src/lib/contracts/rag.ts`
- `app/src/lib/contracts/index.ts`
- `app/src/lib/server/rag/embedding.ts`
- `app/src/lib/server/ragService.ts`
- `app/src/routes/api/terminal/scan/+server.ts`

## Facts
- `terminal/scan` imports `computeTerminalScanEmbedding` from the server embedding facade.
- `ragService.ts` imports RAG service types from `$lib/contracts/rag`.
- `ragService.ts` imports embedding helpers from `$lib/server/rag/embedding`.
- RAG storage behavior is isolated enough to keep SQL and persistence logic unchanged.

## Assumptions
- The copied contract shapes are stable app/server contracts and structurally match current engine types.
- Keeping the actual embedding implementation behind a facade is safer than moving implementation in this slice.

## Open Questions
- Should RAG embedding move to backend `engine/` Python later, or remain an app-server deterministic helper?

## Decisions
- Keep implementation import isolated to `app/src/lib/server/rag/embedding.ts`.
- Put RAG input/output shapes in contracts so server services stop importing arena engine types directly.
- Export RAG `PairQuality` from the contracts barrel as `RAGPairQuality` to avoid colliding with trajectory `PairQuality`.

## Next Steps
- Continue with v4 research/memory and COGOCHI type boundaries in separate slices.

## Exit Criteria
- No app route or non-facade server service imports `$lib/engine/ragEmbedding`. Met.
- `ragService.ts` no longer imports `$lib/engine/arenaWarTypes`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct `$lib/engine/*` dependencies listed for future slices.
