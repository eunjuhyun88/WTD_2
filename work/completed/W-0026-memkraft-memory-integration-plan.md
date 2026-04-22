# W-0026 MemKraft Memory Integration Plan

## Goal

Integrate MemKraft-style memory capabilities into WTD v2 in a staged, measurable way that improves terminal decision quality and debugging efficiency without violating the app/engine boundary.

## Owner

research

## Scope

- Define a phased architecture for v0.2-v0.5 memory concepts aligned to WTD boundaries.
- Fix contract-first API shapes for memory retrieval, feedback, debug sessions, and temporal snapshots.
- Define CTO-grade rollout gates (quality, latency, and regression checks) before each expansion phase.
- Specify implementation sequencing so the first production value is delivered through minimal-surface changes.
- Define success KPIs and instrumentation requirements for go/no-go decisions per phase.

## Non-Goals

- No direct implementation of engine memory modules in this work item.
- No terminal UI redesign or new route ownership split.
- No replacement of existing `/terminal` core interaction contract (`find -> validate -> act -> save`).
- No external vector DB or new infrastructure commitment in the initial rollout.
- No mixed PR that combines architecture planning and deep runtime implementation.

## Canonical Files

- `AGENTS.md`
- `docs/domains/terminal.md`
- `docs/domains/terminal-backend-mapping.md`
- `docs/product/pages/02-terminal.md`
- `app/src/lib/contracts/terminalBackend.ts`
- `app/src/lib/contracts/terminalMemory.ts`
- `app/src/lib/terminal/panelAdapter.ts`
- `app/src/routes/terminal/+page.svelte`

## Decisions

- Memory logic remains `engine/` truth; `app/` only requests, adapts, and renders returned memory-aware signals.
- Rollout is phase-gated; each phase must pass quality and latency thresholds before the next phase starts.
- The first deployable value is context-aware reranking (MemKraft v0.2 mapping) with no major UI contract change.
- Retrieval feedback updates are write-light and asynchronous where possible to protect interactive latency.
- Debug memory and rejected-hypothesis indexing are treated as operational productivity features, not UX garnish.
- Temporal snapshot/time-travel is introduced only after retrieval quality gains are verified.

## Next Steps

- Phase 0 (Contract + Observability, 3-4 days)
  - Draft contract shapes for:
    - `memory/query`
    - `memory/feedback`
    - `memory/debug-session`
    - `memory/snapshot` and `memory/diff`
  - Add instrumentation keys for:
    - retrieval precision proxy
    - latency (p50/p95)
    - reuse/repetition metrics
  - Define baseline metrics from current behavior before any reranking.
- Phase 1 (v0.2 Context-Aware Reranking MVP, 4-5 days)
  - Add context envelope (`symbol`, `timeframe`, `intent`, `mode`) to memory retrieval in engine.
  - Introduce deterministic weighted rerank with fallback to current ranking.
  - Wire app reads to new result shape via adapters, preserving existing tab contracts.
- Phase 2 (v0.3 Reinforcement + Confidence, 3-4 days)
  - Add memory feedback update flow (`access_count`, `last_used_at`, context tags).
  - Add confidence tiers (`verified`, `observed`, `hypothesis`) and applicability conditions.
  - Add memory health checks for orphan/conflict/stale records.
- Phase 3 (v0.4 Debug Memory, 4-6 days)
  - Define debug session entities (hypothesis, evidence, verdict, rejection reason).
  - Index rejected hypotheses for anti-pattern retrieval.
  - Add operator prompts when repeated failed hypotheses are detected.
- Phase 4 (v0.5 Temporal Memory, 3-4 days)
  - Add snapshot capture at key lifecycle points.
  - Add snapshot diff and `as_of` retrieval mode.
  - Connect with terminal deep-link context (`slug`, `instance`) without route drift.
- Governance and release operations
  - Require weekly architecture+ops review of KPI deltas.
  - Enforce kill-switch for each phase behind a feature flag.
  - Keep one primary change type per PR (`contract`, `engine`, or `app`) to reduce review risk.

## PR Plan (Split by Ownership)

- PR-1 `contract`: Add and stabilize memory contracts.
  - Files:
    - `app/src/lib/contracts/terminalMemory.ts`
    - `app/src/lib/contracts/index.ts`
  - Checks:
    - contract parse tests for valid/invalid payloads
    - no route or UI behavior change
- PR-2 `engine`: Implement context-aware retrieval + fallback ranking.
  - Files:
    - engine retrieval/ranking modules
    - engine contract adapter tests
  - Checks:
    - precision proxy improves vs baseline
    - p95 latency regression <= agreed threshold
- PR-3 `app`: Wire retrieval and feedback hooks into terminal flow.
  - Files:
    - `app/src/routes/terminal/+page.svelte`
    - `app/src/lib/terminal/*` adapters/stores
  - Checks:
    - tab mapping contract unchanged
    - right panel never empty
- PR-4 `engine`: Add debug memory session + rejected hypothesis index.
  - Checks:
    - repeated-failure detection paths covered
    - retrieval exposes rejected hypothesis hits
- PR-5 `engine+app`: Snapshot create/diff/time-travel retrieval.
  - Checks:
    - `as_of` retrieval correctness
    - deep-link (`slug`, `instance`) compatibility preserved

## Ticket Backlog (Ready to Assign)

- T1 Contract schema definition (`memory/query`, `feedback`, `debug-session`, `snapshot/diff`).
- T2 Contract parse/safeParse test suite.
- T3 Baseline observability fields and dashboard panel for retrieval metrics.
- T4 Engine reranker (context weighting + deterministic fallback path).
- T5 App adapter integration for memory-aware evidence ordering.
- T6 Feedback event publisher in terminal command/evidence interactions.
- T7 Debug session writer + rejected hypothesis index lookup API.
- T8 Snapshot scheduler + diff endpoint + `as_of` retrieval mode.
- T9 Feature flag and kill-switch wiring per phase.
- T10 Rollout report template (weekly go/no-go review).

## Exit Criteria

- A phase-by-phase integration design exists with clear boundaries and sequencing.
- Each phase has explicit go/no-go gates tied to measurable KPIs.
- Contract surfaces are defined before implementation starts.
- Initial MVP (context reranking) can be implemented without terminal UX contract breakage.
- Leadership can approve or pause rollout from one document without reconstructing chat context.
