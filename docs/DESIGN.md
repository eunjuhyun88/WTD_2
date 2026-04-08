# DESIGN

Purpose:
- Canonical design entry point for the frontend repo.
- Keeps large dated design docs navigable instead of competing.

## Design Authority Stack

1. `docs/design-docs/cogochi-uiux-architecture.md`
   - Official Cogochi IA, route priorities, page structure, and implementation target.
2. `docs/SYSTEM_INTENT.md`
   - Repo-local product thesis and architectural invariants aligned to the official IA.
3. `docs/design-docs/unified-product-model.md`
   - Merged StockClaw + Cogochi surface model, object model, and product loops.
4. `docs/CONTEXT_ENGINEERING.md`
   - Stable context-loading and retrieval policy.
5. `docs/design-docs/core-beliefs.md`
   - Agent-first operating beliefs and doc-writing rules.
6. `docs/design-docs/arena-domain-model.md`
   - Local canonical Arena/Arena War semantics.
7. `docs/design-docs/learning-loop.md`
   - Local canonical ORPO/RAG/Passport learning loop.
8. `docs/references/active/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md`
   - Current structural refactor baseline.
9. `docs/design-docs/six-surface-game-loop.md`
   - Superseded six-surface target kept only for historical rationale.

## Design Principles

1. A short map beats a giant manual.
2. Product intent must be repo-local and versioned.
3. Retrieval policy should be explicit, layered, and cheap to follow.
4. Stable rules should graduate into canonical docs or scripts.
5. Route shells, view models, and presentation should be separable.
6. Domain authority must be explicit:
   - client live-price owner
   - server durable-state owner
   - route-local transient owner
7. Historical docs may explain why; they do not overrule newer canonical docs.

## Current Design Hotspots

- official Cogochi IA rollout across canonical docs and route specs
- Terminal orchestration and Intel decomposition
- Battle and Lab product/implementation alignment
- Agent HQ, doctrine, and memory ownership
- Passport phase-2/on-chain authority boundaries
- QuickTrade and tracked-signal server authority
- Remaining parent-folder design dependence in rare edge cases
- Sibling clone drift vs canonical `frontend` implementation

## Required Promotion Path

- Stable belief or invariant -> `docs/design-docs/core-beliefs.md`
- Stable context-loading rule -> `docs/CONTEXT_ENGINEERING.md`
- Surface behavior or user-facing scope -> `docs/product-specs/*.md`
- Active implementation sequence -> `docs/exec-plans/active/*.md`
- Stable route/state architecture -> `docs/FRONTEND.md`
- Risk tracking -> `docs/QUALITY_SCORE.md` or `docs/exec-plans/tech-debt-tracker.md`

## Source Docs

- `docs/design-docs/cogochi-uiux-architecture.md`
- `docs/design-docs/six-surface-game-loop.md`
- `docs/design-docs/unified-product-model.md`
- `docs/design-docs/index.md`
- `docs/CONTEXT_ENGINEERING.md`
- `docs/design-docs/arena-domain-model.md`
- `docs/design-docs/learning-loop.md`
- `docs/FRONTEND.md`
- `docs/PRODUCT_SENSE.md`
- `docs/PLANS.md`
