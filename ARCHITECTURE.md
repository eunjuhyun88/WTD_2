# STOCKCLAW Frontend Architecture Map

Purpose:
- Top-level map for humans and agents.
- Use this file to choose the next canonical doc before large structural work.

## Read Order

1. `README.md`
2. `AGENTS.md`
3. `docs/README.md`
4. `docs/CONTEXT_ENGINEERING.md`
5. `docs/SYSTEM_INTENT.md`
6. `docs/MULTI_AGENT_MEMORY.md`
7. `ARCHITECTURE.md`
8. Relevant docs from `docs/DESIGN.md`, `docs/FRONTEND.md`, `docs/PLANS.md`

## System Map

`Product intent -> route surfaces -> client state -> API contracts -> server modules -> DB/migrations`

### Route surfaces
- `Home`: positioning, onboarding, first action routing
- `Create Agent`: first-run mint + AI bind + starter setup
- `Terminal`: brain console, doctrine, validation, world readiness
- `World`: BTC-history map and traversal state
- `Battle`: structured whale encounter loop
- `Agent`: growth, record, trainer card, share, rental state

Implementation bridge:
- `/create` and `/world` are target routes, `/arena` is the current `Battle` shell, `/lab` + `/passport` merge into `Agent`, and `/signals` stays secondary.

### Client authority
- Live market truth stays in `priceStore`; route stores own transient flow state only.

### Server authority
- Auth, profile, badges, quick trades, tracked signals, persistence, and learning data stay server-authoritative and repo-local.

## Non-Negotiable Boundaries

1. `frontend/` is the canonical implementation target.
2. `docs/archive/` is not current authority.
3. Product intent must be readable from repo-local markdown.
4. Stable rules belong in canonical docs or scripts, not only watch logs.
5. The agent should be able to start with a small map and progressively disclose detail.

## Canonical Doc Entry Points

- Design and architecture: `docs/DESIGN.md`
- Context loading and resume policy: `docs/CONTEXT_ENGINEERING.md`
- Route/page behavior: `docs/page-specs/index.md`
- Frontend route/state ownership: `docs/FRONTEND.md`
- Product rules and user-value constraints: `docs/PRODUCT_SENSE.md`
- Current plans and execution flow: `docs/PLANS.md`
- Quality grades and drift: `docs/QUALITY_SCORE.md`
- Reliability boundaries: `docs/RELIABILITY.md`
- Security boundaries: `docs/SECURITY.md`

## When To Go Deeper

- Need system or handoff context: open `docs/SYSTEM_INTENT.md` or `docs/MULTI_AGENT_MEMORY.md`.
- Need context loading rules: open `docs/CONTEXT_ENGINEERING.md`, then `docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md`.
- Need route or state ownership: open `docs/page-specs/index.md` or `docs/FRONTEND.md`.
- Need the structural refactor baseline: open `docs/references/active/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md`.
- Need cutover order: open `docs/exec-plans/active/frontend-backend-separation-plan-2026-03-07.md`.
- Need Arena semantics: open `docs/product-specs/arena.md`, `docs/design-docs/arena-domain-model.md`, and `docs/design-docs/learning-loop.md`.
- Need a primary surface contract: open the relevant `docs/product-specs/*.md` and `docs/page-specs/*.md` from `docs/README.md`.
- Need secondary route behavior: open the relevant page spec under `docs/page-specs/`.
- Need plan status: open `docs/PLANS.md` and `docs/exec-plans/index.md`.
