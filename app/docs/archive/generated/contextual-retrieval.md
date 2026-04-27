# Contextual Retrieval

This generated artifact summarizes the query-time retrieval index for canonical docs.

## Retrieval Model

- Retrieval mode: deterministic contextual BM25
- Chunk context: path, authority, section headings, and surface ownership are prepended before indexing
- Goal: reduce full-doc scanning when the agent is uncertain what to open next

## Index Stats

- Source docs indexed: `40`
- Chunks indexed: `395`
- Chunk size (words): `120`
- Overlap size (words): `30`
- Default top-k: `5`

## Top Indexed Paths

| Path | Chunk Count |
| --- | --- |
| `README.md` | 57 |
| `docs/design-docs/unified-product-model.md` | 33 |
| `docs/CONTEXT_EVALUATION.md` | 22 |
| `docs/CONTEXT_ENGINEERING.md` | 18 |
| `docs/design-docs/six-surface-ux-contract.md` | 16 |
| `docs/SYSTEM_INTENT.md` | 16 |
| `docs/design-docs/arena-domain-model.md` | 15 |
| `docs/design-docs/six-surface-game-loop.md` | 15 |
| `AGENTS.md` | 10 |
| `docs/design-docs/learning-loop.md` | 10 |
| `docs/product-specs/arena.md` | 10 |
| `docs/product-specs/home.md` | 10 |
| `ARCHITECTURE.md` | 9 |
| `docs/CONTEXT_PLATFORM.md` | 9 |
| `docs/MULTI_AGENT_COORDINATION.md` | 9 |

## Commands

- `npm run retrieve:query -- --q "<term>"`
- `npm run registry:serve` then `GET /retrieve?q=<term>`

## Limits

- This is a lexical/contextual bootstrap index, not an embedding+rereank system.
- For very large repos, the JSON index may later move to runtime-only storage.

