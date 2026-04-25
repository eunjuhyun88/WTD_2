# Product Surfaces

## Mandatory Read First

Before any surface implementation/review work:

1. `docs/domains/contracts.md` (Surface-Contract Index)
2. `docs/product/pages/00-system-application.md`
3. target page spec in `docs/product/pages/*`

Do not begin from route/component files first.

## Day-1 Active Surfaces

- `app/src/routes/+page.svelte` (`/`): thesis + first action entry
- `app/src/routes/terminal/+page.svelte` (`/terminal`): review + capture + registration
- `app/src/routes/lab/+page.svelte` (`/lab`): evaluate + refine + activate
- `app/src/routes/dashboard/+page.svelte` (`/dashboard`): inbox + alerts + feedback

## Canonical Page Specs

- Global application rules: `docs/product/pages/00-system-application.md`
- Home spec: `docs/product/pages/01-home.md`
- Terminal spec: `docs/product/pages/02-terminal.md`
- Lab spec: `docs/product/pages/03-lab.md`
- Dashboard spec: `docs/product/pages/04-dashboard.md`
- Extra implemented surfaces snapshot: `docs/product/pages/05-extra-implemented-surfaces.md`

## Additional Implemented Surfaces (Outside Day-1 Canonical)

- `/patterns`
- `/settings`
- `/passport`
- `/agent`, `/agent/[id]` (redirects to `/lab`)

## Auxiliary Surfaces

- ChatOps / CUI pattern review is defined in `docs/domains/chatops-pattern-review-surface.md`.
- ChatOps may reduce friction for candidate review, outcome verdicts, benchmark decisions, and promotion decisions.
- ChatOps does not replace `/terminal`, `/lab`, or `/dashboard`, and it must not own engine truth.

## Supporting APIs

- `app/src/routes/api/cogochi/*`: analysis and terminal orchestration
- `app/src/routes/api/market/*`: market data endpoints for UI rendering
- `app/src/routes/api/engine/*`: pass-through engine proxy routes

## Surface Rules

- Surfaces must consume engine artifacts through defined contracts.
- Surface code must not duplicate engine feature/block logic.
- UI-specific state lives in `app`; domain logic remains in `engine`.
- Use Day-1 vocabulary consistently: `capture`, `challenge`, `AutoResearch`, `instance`, `evaluate`, `watching`.
- ChatOps actions must write canonical engine/app records; chat history is audit context, not source of truth.
