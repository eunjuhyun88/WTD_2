# App Agent Router

This file is a local router for `app/`. The repository-wide canonical rules live at root `AGENTS.md`.

## Read Order For App Work

1. Root `../AGENTS.md`
2. Relevant `../work/active/*.md`
3. Relevant root `../docs/domains/*.md`
4. Relevant root `../docs/product/*.md`
5. This app folder's required code only

## Boundary

- `app/` owns surfaces, API routes, auth/session, SSE, persistence, and orchestration.
- `engine/` owns backend market logic, features, blocks, scanner, scoring, and evaluation.
- `app/` must not duplicate engine business logic.

## Default Excludes For App Tasks

- `node_modules/`
- `build/`
- `.svelte-kit/`
- `docs/generated/`
- `docs/COGOCHI.md`
- `_archive/`
- `memory/memory/`
- `**/__pycache__/`

## When To Read Legacy Docs

Only open `app/docs/COGOCHI.md` or other `app/docs/*` legacy material when a root canonical doc explicitly sends you there.
