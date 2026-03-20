# Design Docs Index

Purpose:
- Catalog major design documents and clarify their status.

| Doc | Status | Use when | Notes |
| --- | --- | --- | --- |
| `docs/SYSTEM_INTENT.md` | active canonical | you need product thesis and invariants | Start here first. |
| `docs/design-docs/six-surface-game-loop.md` | active canonical | you need the final user-facing IA and gating rules | Home / Create Agent / Terminal / World / Battle / Agent |
| `docs/design-docs/six-surface-ux-contract.md` | active canonical | you need page purpose, CTA, and nav rules for the six-surface IA | Implementation-grade UX contract. |
| `docs/design-docs/unified-product-model.md` | active canonical | you need the merged StockClaw + Cogochi product loops and object model | Character, Lab, Market, Passport alignment lives here. |
| `docs/design-docs/core-beliefs.md` | active canonical | you need agent-first working principles | Stable operating beliefs. |
| `docs/design-docs/arena-domain-model.md` | active canonical | you need Arena/Arena War domain semantics | Local replacement for common upstream lookups. |
| `docs/design-docs/learning-loop.md` | active canonical | you need ORPO/RAG/Passport learning semantics | Local replacement for common upstream lookups. |
| `docs/DESIGN.md` | active canonical | you need design routing | Entry point. |
| `docs/references/active/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md` | active working design | structural refactor work | Current baseline. |
| `docs/archive/historical/root-cleanup-2026-03-17/overall-architecture-design.md` | historical reference | you need older broad rationale | Do not treat as newest authority. |
| `../STOCKCLAW_UNIFIED_DESIGN.md` | upstream deep reference | you need edge-case product semantics not yet localized | Prefer local canonical docs first. |

Rule:
- If a dated working design becomes durable, summarize its stable parts into canonical docs.
