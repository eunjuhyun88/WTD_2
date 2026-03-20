# STOCKCLAW Docs Context Map
Purpose:
- `README.md` is the collaboration and execution SSOT.
- This file is the task-level document router.
- Read this before opening multiple specs, audits, or old plans.
## Fast Start
1. `README.md`
2. `AGENTS.md`
3. `docs/SYSTEM_INTENT.md`
4. `docs/CONTEXT_ENGINEERING.md`
5. `docs/MULTI_AGENT_MEMORY.md`
6. `ARCHITECTURE.md`
7. `docs/README.md`
8. Relevant design/spec docs
## Active Boundaries
- Active implementation target: current git worktree rooted at this repository
- Canonical code lives in: `src/`, `db/`, `supabase/`, `scripts/`, `docs/`
- Sibling clone folders outside this repo are reference-only unless a current plan explicitly says otherwise.
- `docs/archive/` is historical context, not current authority.
- `docs/AGENT_WATCH_LOG.md` is an operations log, not a design spec. Read targeted entries only.
## Structured Knowledge Base
- `docs/design-docs/` — stable design beliefs and design-catalog index
- `docs/product-specs/` — short specs for the target IA plus current legacy implementation slices
- `docs/page-specs/` — short route/page specs for the main surfaces plus selected shared routes
- `docs/exec-plans/` — active plans, completed plans, debt tracker
- `docs/task-contracts/` — active and completed task stop-conditions
- `docs/generated/` — derived navigation artifacts
- `docs/decisions/` — stable architectural or IA decisions
- `docs/handoffs/` — branch- or slice-level continuation notes
- `docs/templates/` — decision and handoff templates
- `docs/references/` — reference shelf and scripts
- `docs/references/active/` — still-used non-canonical support docs
- `docs/archive/historical/` — superseded drafts
- `docs/archive/retire-candidates/` — low-value docs kept for review
## Canonical Entry Docs
| If you need... | Open this first | Then go deeper to... |
| --- | --- | --- |
| final six-surface IA | `docs/design-docs/six-surface-game-loop.md` | relevant surface specs below |
| merged StockClaw + Cogochi product model | `docs/design-docs/unified-product-model.md` | domain objects, progression, and monetization model |
| multi-agent memory and handoff structure | `docs/MULTI_AGENT_MEMORY.md` | `docs/decisions/`, `docs/handoffs/`, `.agent-context/` |
| context strategy and resume order | `docs/CONTEXT_ENGINEERING.md` | `docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md` |
| page/route behavior | `docs/page-specs/index.md` | relevant page spec + generated maps |
| product thesis and invariants | `docs/SYSTEM_INTENT.md` | `docs/design-docs/core-beliefs.md` |
| top-level architecture map | `ARCHITECTURE.md` | `docs/DESIGN.md`, `docs/FRONTEND.md` |
| current design authority | `docs/DESIGN.md` | `docs/design-docs/index.md`, dated working docs |
| route/state ownership | `docs/FRONTEND.md` | `docs/FE_STATE_MAP.md`, refactor design |
| user-facing scope and heuristics | `docs/PRODUCT_SENSE.md` | `docs/product-specs/*.md` |
| current implementation plans | `docs/PLANS.md` | `docs/exec-plans/index.md` |
| task finish criteria | `docs/TASK_CONTRACTS.md` | `docs/task-contracts/active/`, `docs/generated/task-contract-report.md` |
| practical evidence and validation | `docs/CONTEXT_VALIDATION.md` | `docs/generated/context-validation-report.md` |
| quality and drift priorities | `docs/QUALITY_SCORE.md` | `docs/exec-plans/tech-debt-tracker.md` |
| reliability boundaries | `docs/RELIABILITY.md` | perf/runbook docs |
| security boundaries | `docs/SECURITY.md` | security review + scale plan |
## Canonical Docs By Topic
| Topic | Read these first | Notes |
| --- | --- | --- |
| Repo workflow | `README.md`, `AGENTS.md`, `docs/CONTEXT_ENGINEERING.md`, `docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md` | Covers gates, loading order, watch log, save/compact/restore. |
| Final six-surface IA | `docs/SYSTEM_INTENT.md`, `docs/design-docs/six-surface-game-loop.md`, `docs/product-specs/index.md` | Start here for `Home / Create Agent / Terminal / World / Battle / Agent`. |
| Multi-agent memory, claims, handoffs | `docs/MULTI_AGENT_MEMORY.md`, `docs/decisions/README.md`, `docs/handoffs/README.md` | Use this before setting up a new worktree or splitting ownership. |
| IA migration sequence | `docs/exec-plans/active/six-surface-game-loop-ia-2026-03-17.md`, `docs/design-docs/six-surface-game-loop.md`, `docs/design-docs/six-surface-ux-contract.md` | Use this before creating `/create`, `/world`, or merging `/lab` + `/passport`. |
| Page / flow behavior | `docs/page-specs/index.md`, relevant `docs/page-specs/*.md`, `docs/generated/*.md` | Use this before opening dated PRD/FSD docs. |
| Product / system intent | `docs/SYSTEM_INTENT.md`, `docs/PRODUCT_SENSE.md`, `docs/design-docs/unified-product-model.md`, `docs/product-specs/index.md` | Use this set for ownership, progression, proof, and monetization semantics. |
| Architecture / state ownership | `ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/FRONTEND.md` | These are the canonical architecture entry points. |
| Generated navigation maps | `docs/generated/route-map.md`, `docs/generated/store-authority-map.md`, `docs/generated/api-group-map.md` | Use these for fast first-pass navigation before reading implementation files. |
| Current frontend refactor baseline | `docs/PLANS.md`, `docs/references/active/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md`, `docs/REFACTORING_BACKLOG.md` | Start with the plan/router, then the dated execution design. |
| Repo-wide redesign and FE/BE validation | `docs/exec-plans/active/full-stack-redesign-validation-2026-03-07.md`, `docs/exec-plans/active/frontend-backend-separation-plan-2026-03-07.md`, `docs/references/active/frontend-backend-boundary-map-2026-03-06.md` | Use this before deciding any major split or backend extraction. |
| Frontend/backend separation target | `docs/exec-plans/active/frontend-backend-separation-plan-2026-03-07.md`, `docs/references/active/frontend-backend-boundary-map-2026-03-06.md`, `docs/API_CONTRACT.md` | Read this before moving API/server code across app boundaries. |
| Terminal / Intel / Scan | `docs/product-specs/terminal.md`, `docs/FRONTEND.md`, `docs/references/active/terminal-refactor-master-plan-2026-03-06.md`, `docs/references/active/TERMINAL_SCAN_E2E_SPEC.md` | Surface spec first, then implementation plan and API flow. |
| Arena / Arena War / ORPO | `docs/product-specs/arena.md`, `docs/design-docs/arena-domain-model.md`, `docs/design-docs/learning-loop.md`, `docs/generated/game-record-schema.md` | Use upstream unified design only when local docs are insufficient. |
| Passport / profile / learning | `docs/product-specs/passport.md`, `docs/FRONTEND.md`, `docs/references/active/PASSPORT_BACKEND_ARCHITECTURE_v1_2026-02-25.md`, `docs/API_CONTRACT.md` | Use when touching profile authority or learning pipeline flows. |
| Market / copy trade / community | `docs/product-specs/signals.md`, `docs/page-specs/signals-page.md`, `docs/API_CONTRACT.md`, `docs/references/active/community-chart-signal-copytrade-flow-2026-03-06.md` | Object-model and conversion flow first. |
| Signal detail / comments / creator drilldown | `docs/page-specs/signals-detail-page.md`, `docs/page-specs/creator-page.md`, `docs/product-specs/signals.md`, `docs/API_CONTRACT.md` | Use this before opening the new social detail routes in code. |
| Agent roster / oracle split | `docs/page-specs/agents-page.md`, `docs/page-specs/oracle-page.md`, `docs/page-specs/signals-page.md` | `/agents` is the collection route; `/oracle` is a redirect shim; the embedded oracle leaderboard lives under `/signals?view=ai`. |
| API / data / providers | `docs/API_CONTRACT.md`, `docs/generated/db-schema.md`, `docs/references/active/database-design.md`, `docs/references/active/BACKEND_SECURITY_REVIEW_2026-02-25.md` | Contract first, then data/security constraints. |
| Routes / stores / API surface inventory | `docs/generated/route-map.md`, `docs/generated/store-authority-map.md`, `docs/generated/api-group-map.md` | Fast repo-local inventory for navigation and authority checks. |
| Cleanup / drift / audits | `docs/QUALITY_SCORE.md`, `docs/exec-plans/tech-debt-tracker.md`, `docs/references/active/structure-mismatch-audit-latest.md`, `docs/references/active/full-file-audit.md` | Canonical score/debt view before raw audits. |
## Root Policy
- Root `docs/` should contain only canonical docs, operating policy, and collaboration surfaces.
- Former root working drafts now live under `docs/archive/historical/root-cleanup-2026-03-17/`.
- Former root one-off or low-confidence docs now live under `docs/archive/retire-candidates/root-cleanup-2026-03-17/`.
- Still-used technical support docs now live under `docs/references/active/`.
- Promote durable content from dated references into canonical docs.
- Do not start in `docs/archive/**` unless a canonical doc explicitly points there.
## Surface Routing
| If the task is about... | Read this subset first |
| --- | --- |
| Home / onboarding / first-run | `docs/product-specs/home.md`, `docs/page-specs/home-onboarding.md`, `docs/design-docs/six-surface-game-loop.md` |
| Home positioning and first-action path | `docs/product-specs/home.md`, `docs/page-specs/home-onboarding.md`, `docs/PRODUCT_SENSE.md` |
| Create Agent target | `docs/product-specs/create-agent.md`, `docs/design-docs/six-surface-game-loop.md` |
| Terminal brain console | `docs/product-specs/terminal.md`, `docs/page-specs/terminal-page.md`, `docs/design-docs/six-surface-game-loop.md` |
| World target | `docs/product-specs/world.md`, `docs/design-docs/six-surface-game-loop.md` |
| Battle target and current arena shell | `docs/product-specs/arena.md`, `docs/page-specs/arena-page.md`, `docs/design-docs/six-surface-game-loop.md` |
| Agent hub target | `docs/product-specs/agents.md`, `docs/page-specs/lab-page.md`, `docs/page-specs/passport-page.md` |
| Nav labels and CTA contract | `docs/design-docs/six-surface-ux-contract.md`, `docs/design-docs/six-surface-game-loop.md` |
| Terminal UI split, layout, responsive logic | `docs/product-specs/terminal.md`, `docs/page-specs/terminal-page.md`, `docs/FRONTEND.md`, `docs/references/active/terminal-refactor-master-plan-2026-03-06.md` |
| Scan engine, market feed, intel policy | `docs/product-specs/terminal.md`, `docs/references/active/TERMINAL_SCAN_E2E_SPEC.md`, `docs/INTERACTION_CALL_MAP.md`, `docs/API_CONTRACT.md` |
| Arena battle flow, GameRecord, ORPO/RAG memory | `docs/product-specs/arena.md`, `docs/page-specs/arena-page.md`, `docs/design-docs/arena-domain-model.md`, `docs/generated/game-record-schema.md` |
| Arena War 7-phase flow | `docs/page-specs/arena-war-page.md`, `docs/product-specs/arena.md`, `docs/design-docs/arena-domain-model.md` |
| Arena v2 route shell | `docs/page-specs/arena-v2-page.md`, `docs/product-specs/arena.md`, `docs/page-specs/arena-page.md` |
| Profile and legacy passport slice | `docs/product-specs/passport.md`, `docs/page-specs/passport-page.md`, `docs/references/active/PASSPORT_BACKEND_ARCHITECTURE_v1_2026-02-25.md`, `docs/API_CONTRACT.md` |
| Secondary signals/community route | `docs/product-specs/signals.md`, `docs/page-specs/signals-page.md`, `docs/API_CONTRACT.md` |
| Signal detail, comments, creator profile | `docs/page-specs/signals-detail-page.md`, `docs/page-specs/creator-page.md`, `docs/product-specs/signals.md`, `docs/API_CONTRACT.md` |
| Agent collection, roster stats, or oracle confusion | `docs/page-specs/agents-page.md`, `docs/page-specs/signals-page.md`, `docs/generated/store-authority-map.md` |
| Legacy `/oracle` links or redirect behavior | `docs/page-specs/oracle-page.md`, `docs/page-specs/signals-page.md`, `docs/product-specs/signals.md` |
| Agent collection and learning-memory surface | `docs/product-specs/agents.md`, `docs/page-specs/agents-page.md`, `docs/page-specs/lab-page.md` |
| Passport proof, holdings, and revenue | `docs/product-specs/passport.md`, `docs/page-specs/passport-page.md`, `docs/design-docs/unified-product-model.md` |
| User preferences and local reset behavior | `docs/page-specs/settings-page.md`, `docs/FRONTEND.md`, `docs/API_CONTRACT.md` |
| State ownership / store cleanup | `ARCHITECTURE.md`, `docs/FRONTEND.md`, `docs/references/active/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md`, `docs/FE_STATE_MAP.md` |
| Security / auth / rate limits | `docs/SECURITY.md`, `docs/references/active/BACKEND_SECURITY_REVIEW_2026-02-25.md`, `docs/references/active/SECURITY_SCALE_PLAN_2026-02-25.md`, `docs/API_CONTRACT.md` |
## Context Budget Rules
- Do not bulk-read every file in `docs/`.
- Do not skip the canonical entry docs and jump straight into dated working docs.
- Do not treat a provisional task contract as sufficient; replace placeholder finish checks with task-specific checks.
- Do not treat old audits as source of truth when a newer execution design exists.
- Do not start in `docs/archive/` unless the active doc explicitly points there.
- Do not scan the full watch log; use keyword/date filtering when you need recent decisions.
- Do not require parent-folder docs for normal first-pass context recovery.
- When a task changes ongoing behavior or architecture, update the canonical doc for that surface, not just the watch log.
## Promotion Rules
- Put stable execution rules in `AGENTS.md` or `README.md`.
- Put root architecture routing in `ARCHITECTURE.md`.
- Put task routing and doc authority changes in `docs/README.md`.
- Put stable cross-agent workflow changes in `docs/MULTI_AGENT_MEMORY.md` and `docs/decisions/`.
- Put stable surface intent in `docs/product-specs/*.md`.
- Put current implementation plans in dated execution design docs or `docs/exec-plans/active/`.
- Move superseded plans/specs into `docs/archive/` once they are no longer current.
## Known Gaps
- Some deep Arena/War edge cases still live in the upstream unified design outside the git root.
- Several deep implementation docs are still dated working plans rather than promoted canonical specs.
- Historical logs and archived rewrite context may still mention the older standalone `/oracle` ownership; canonical docs now treat it as a redirect shim into `/signals?view=ai`.
- Multiple sibling clones still exist, which increases drift risk even when `frontend` is treated as canonical.
