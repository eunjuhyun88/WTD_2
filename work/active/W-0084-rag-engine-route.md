# W-0084 RAG Engine Route

## Goal
Move deterministic RAG embedding and dedupe-hash helpers behind `engine-api` so remote mode no longer fail-closes for RAG.

## Scope
- Add Python engine implementations for terminal-scan embedding, quick-trade embedding, signal-action embedding, and dedupe hash.
- Expose dedicated engine API endpoints for those helpers.
- Convert app rag runtime adapter and callers to async transport-safe usage.

## Non-Goals
- No pgvector query behavior change.
- No semantic redesign of the 256d embedding layout.
- No migration of DB persistence from app to engine in this slice.

## Canonical Files
- `engine/rag/embedding.py`
- `engine/api/routes/rag.py`
- `engine/api/schemas_rag.py`
- `engine/tests/test_rag_routes.py`
- `app/src/lib/server/engineClient.ts`
- `app/src/lib/server/engine-runtime/rag.ts`
- `app/src/lib/server/rag/embedding.ts`
- `app/src/lib/server/ragService.ts`
- `app/src/routes/api/terminal/scan/+server.ts`

## Facts
- Current app rag runtime adapter still fail-closes in remote mode.
- The helper functions are deterministic and CPU-local, so they are good candidates for a first engine-owned RAG transport.
- App rag helper usage already sits inside async flows (`terminal scan` route and `ragService` save paths).
- Engine now exposes dedicated `/rag/*` helper routes and targeted tests pass.
- App rag helper callers now use async transport-safe calls.

## Assumptions
- Minor local/remote hash divergence across bucket boundaries is acceptable because dedupe is already time-window based.

## Open Questions
- Whether later RAG search/save should also move behind engine or remain app-owned due to DB coupling.

## Decisions
- Use dedicated route handlers instead of a single polymorphic endpoint to keep contracts explicit.
- Promote the app rag helper surface to async so transport can switch without hidden sync fallbacks.
- Keep local mode as deterministic fallback through the existing TypeScript implementation.

## Next Steps
- Reassess whether RAG save/search DB ownership should remain app-side or move behind engine later.
- Use the same async-helper promotion pattern for the next deterministic runtime bridge if needed.

## Exit Criteria
- `ENGINE_RUNTIME_MODE=remote` no longer fail-closes for RAG helper functions. Met.
- Targeted engine route tests pass. Met: `uv run pytest tests/test_rag_routes.py`.
- `npm run check` passes in `app/`. Met: `svelte-check found 0 errors and 0 warnings`.

## Handoff Checklist
- Async boundary changes are called out explicitly for downstream callers.
- Remaining engine-runtime remote gaps are updated after this slice lands.
