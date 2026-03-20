# Page Specs Index

Purpose:
- Route and flow-level specs for the canonical frontend repo.
- Sits between surface product specs and dated deep-dive documents.

## Read Order

1. `docs/SYSTEM_INTENT.md`
2. Relevant `docs/product-specs/*.md`
3. Relevant page spec below
4. Generated maps or deeper design docs only if still needed

## Page Specs

- `docs/page-specs/home-onboarding.md`
- `docs/page-specs/create-agent-page.md`
- `docs/page-specs/terminal-page.md`
- `docs/page-specs/world-page.md`
- `docs/page-specs/arena-page.md`
- `docs/page-specs/lab-page.md`
- `docs/page-specs/signals-page.md`
- `docs/page-specs/signals-detail-page.md`
- `docs/page-specs/creator-page.md`
- `docs/page-specs/passport-page.md`
- `docs/page-specs/agents-page.md`
- `docs/page-specs/oracle-page.md`
- `docs/page-specs/settings-page.md`
- `docs/page-specs/arena-war-page.md`
- `docs/page-specs/arena-v2-page.md`

## Rules

- Keep page specs short and route-scoped.
- Capture current route behavior first; do not describe an aspirational PRD flow that the route does not actually implement.
- Capture primary job, state authority, key APIs, and failure states.
- Do not rewrite full PRDs or FSDs here.
- If a page spec becomes too large, split by sub-flow rather than growing the route doc into a manual.
