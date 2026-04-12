# Cogochi Docs

**Canonical product doc:** [`./COGOCHI.md`](./COGOCHI.md)

That's the single source of truth for the Cogochi product — thesis, core loop, surfaces, AutoResearch pipeline, data contracts, pricing, kill criteria, home landing spec, phase 2/3 roadmap. Read it once, and you should not need any other file in this folder to understand what we're building.

## Everything else in this folder

- **Operational / infra docs** (`DESIGN.md`, `FRONTEND.md`, `PLANS.md`, `SECURITY.md`, `RELIABILITY.md`, `QUALITY_SCORE.md`, `ENGINEERING.md`, `API_CONTRACT.md`, `CI_PIPELINE.md`, `GIT_WORKFLOW.md`, `SANDBOX_POLICY.md`, `TOOL_DESIGN.md`, etc.) — routing and boundaries for engineering concerns, product-neutral.
- **Agent discipline** (`AGENT_*.md`, `MULTI_AGENT_*.md`, `ORCHESTRATION.md`, `AUTOPILOT.md`, `HARNESS.md`, `CLAUDE_COMPATIBILITY.md`, `CONTEXT_*.md`) — how Claude agents coordinate work on this repo.
- **`design-docs/core-beliefs.md`** — stable agent-first working principles. Kept because they're product-neutral.
- **Support docs** (FE_STATE_MAP, INTERACTION_CALL_MAP, database-design, schema-redesign-analysis, feature-specification, audits, etc.) — engineering reference material, still useful.

## What used to be here

The `product-specs/` and `page-specs/` folders, plus `SYSTEM_INTENT.md`, `PRODUCT_SENSE.md`, root `ARCHITECTURE.md`, and most of `design-docs/` were v3 "ERA Battle Game" product docs. On **2026-04-11** they were consolidated into `COGOCHI.md` (v5 AutoResearch direction) and the originals were moved out of the repo to `~/Downloads/기타_문서/cogochi-v3-archive-2026-04-11/` (user-local, not committed).

If you need v3 historical reference for any reason, look there. For current product decisions, look only at `COGOCHI.md`.

## Rule

New product thinking goes into `COGOCHI.md` — edit in place. Do not create parallel design docs. The whole point is one file, one truth.
