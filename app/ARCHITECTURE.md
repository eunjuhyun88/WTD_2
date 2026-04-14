# App Architecture

This file is a thin app-local map. Root docs are canonical for active work.

## Canonical Read Order

1. Root `../AGENTS.md`
2. Relevant `../work/active/*.md`
3. Root `../docs/domains/contracts.md`
4. Relevant root `../docs/domains/{terminal,lab,dashboard,engine-pipeline,evaluation}.md`
5. Root `../docs/product/{brief,surfaces}.md`

## App Role

`app/` owns:

- UI surfaces under `src/routes/`
- shared UI components under `src/components/`
- API routes and server orchestration under `src/routes/api/`
- auth/session/SSE/persistence concerns

`app/` does not own:

- feature calculation
- building blocks
- scanner logic
- scoring/evaluation logic

Those remain canonical in `../engine/`.

## Important Paths

- Surfaces: `src/routes/terminal`, `src/routes/lab`, `src/routes/dashboard`
- Shared contracts: `src/lib/contracts/`
- Server orchestration: `src/routes/api/`
- Legacy docs: `docs/` under `app/` are reference-first, not canonical
