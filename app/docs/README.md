# Cogochi Legacy Docs Router

This folder is legacy/reference-first. Do not start active work from here.

## Canonical Read Order

1. Root [`AGENTS.md`](../../AGENTS.md)
2. Relevant `work/active/*.md`
3. Relevant root `docs/domains/*.md`
4. Root `docs/product/*.md`
5. Only then open required code files

## Canonical Truth Now Lives At

- Backend truth: `engine/`
- Product truth: root `docs/product/*.md`
- Domain maps: root `docs/domains/*.md`
- Decisions: root `docs/decisions/*.md`
- Runbooks: root `docs/runbooks/*.md`

## Status of This Folder

- [`./COGOCHI.md`](./COGOCHI.md) is a legacy PRD reference, not the primary canonical source.
- Operational notes here may still be useful, but they are subordinate to the root docs tree.
- Historical drift is expected unless a file is explicitly promoted into root `docs/`.

## Everything else in this folder

- **Operational / infra docs** (`DESIGN.md`, `FRONTEND.md`, `PLANS.md`, `SECURITY.md`, `RELIABILITY.md`, `QUALITY_SCORE.md`, `ENGINEERING.md`, `API_CONTRACT.md`, `CI_PIPELINE.md`, `GIT_WORKFLOW.md`, `SANDBOX_POLICY.md`, `TOOL_DESIGN.md`, etc.) — routing and boundaries for engineering concerns, product-neutral.
- **Agent discipline** (`AGENT_*.md`, `MULTI_AGENT_*.md`, `ORCHESTRATION.md`, `AUTOPILOT.md`, `HARNESS.md`, `CLAUDE_COMPATIBILITY.md`, `CONTEXT_*.md`) — how Claude agents coordinate work on this repo.
- **`design-docs/core-beliefs.md`** — stable agent-first working principles. Kept because they're product-neutral.
- **Support docs** (FE_STATE_MAP, INTERACTION_CALL_MAP, database-design, schema-redesign-analysis, feature-specification, audits, etc.) — engineering reference material, still useful.

## What Used To Be Here

The `product-specs/` and `page-specs/` folders, plus `SYSTEM_INTENT.md`, `PRODUCT_SENSE.md`, root `ARCHITECTURE.md`, and most of `design-docs/` were v3 "ERA Battle Game" product docs. On **2026-04-11** they were consolidated into `COGOCHI.md` (v5 AutoResearch direction) and the originals were moved out of the repo to `~/Downloads/기타_문서/cogochi-v3-archive-2026-04-11/` (user-local, not committed).

If you need v3 historical reference for any reason, look there. For current product decisions, use the root `docs/` tree.

## Rule

Do not add new canonical product thinking under `app/docs/`.
Promote current truth into the root `docs/product/`, `docs/domains/`, or `docs/decisions/` trees instead.
