# Agent Detail Page

Route scope:
- `/agent/[id]`

Purpose:
- Define the per-agent HQ route for doctrine, memory, history, and record management.

## Primary User Job

- Open one owned agent and decide how to adjust doctrine, inspect memory, review version history, or inspect battle record.

## Core Flow

1. Route resolves the selected agent from route params and hydrates stats plus doctrine state.
2. Header shows identity, stage, bond, mood, and win-rate framing.
3. Tabs split the page into `Overview`, `Doctrine`, `Memory`, `History`, and `Record`.
4. Doctrine edits save through `doctrineStore`.
5. Test or training CTA routes the selected agent into `Lab`.

## Guardrails

- Keep this route agent-specific; do not let it turn into a second roster surface.
- `Doctrine` and `Memory` should stay first-class tabs.
- History and record must reflect durable or at least clearly scoped evidence, not anonymous generic stats.
- The route should always preserve a clear way back to `/agent`.

## Key UI Blocks

- breadcrumb back to `/agent`
- stage and bond status header
- tab strip with animated indicator
- overview panels for evolution and market readiness
- doctrine editor
- memory card grid and pagination
- doctrine history list
- battle record list

## State Authority

- agent identity: `AGDEFS`
- stats, stage, bond, mood, and win rate: `agentData`
- doctrine edit state and versions: `doctrineStore`
- selected tab and pagination: route local

## Supporting APIs And Data

- `$lib/data/agents`
- `$lib/stores/agentData`
- `$lib/stores/doctrineStore`
- `$lib/utils/deepLinks`
- `src/routes/agent/[id]/+page.svelte`

## Failure States

- missing agent params collapse the route without a safe fallback
- doctrine edits and lab handoff drift apart
- memory, history, and record read as the same evidence surface

## Read These First

- `docs/product-specs/agents.md`
- `docs/page-specs/agent-page.md`
- `docs/page-specs/lab-page.md`
- `docs/design-docs/cogochi-uiux-architecture.md`
