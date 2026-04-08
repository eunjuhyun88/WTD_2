# Terminal Product Spec

Purpose:
- Short product spec for the agent brain console: model binding, doctrine, training, and readiness.

## Primary User Job

Inspect chart context, identify zones or doctrine ideas, and forward that insight into `Lab` or `Agent HQ`.

## Surface Role In The Official IA

`Terminal` is the optional chart-analysis and doctrine-idea surface.

It should let the user:
- inspect chart structure and zones
- run scans or ask questions
- inspect why the agent made a judgment
- derive doctrine hypotheses
- hand useful ideas into `Lab`, `Agent HQ`, or trade-support flows

## Current Route Shape

- `/terminal` currently ships as three route shells: mobile, tablet, and desktop.
- The route runtime is already split into layout, action, chat, and community-share concerns.
- Live ticker loading, density mode, background alert scanning, copy-trade bootstrap, and share modal all live inside the route now.
- Use `docs/page-specs/terminal-page.md` for the actual route contract; keep this file focused on surface intent.

## Core Flows

1. Ask a question or run a scan on live chart context.
2. Inspect agent reasoning, signals, and market context.
3. Convert useful insight into doctrine edits, lab reruns, or trade actions.
4. Exit with a clearer next action instead of staying trapped in analysis.

## Product Constraints

- Terminal should privilege legible analysis over raw operator-console density.
- Layout logic, orchestration, and presentation should not collapse into one god-shell.
- Terminal should remain optional in the builder loop, not a mandatory first screen after home.
- Users should understand what is live, inferred, cached, or simulated.
- Data and action flows should remain inspectable by future agents.

## Target IA

- User-facing role: `chart-analysis and doctrine-idea console`
- Common downstream handoffs:
  - `/lab`
  - `/agent/[id]`
  - `/battle` only when a battle-ready context already exists

## Supporting Docs

- `docs/design-docs/cogochi-uiux-architecture.md`
- `docs/design-docs/unified-product-model.md`
- `docs/product-specs/agents.md`
- `docs/references/active/terminal-refactor-master-plan-2026-03-06.md`
- `docs/references/active/terminal-uiux-refactor-design-v3-2026-03-06.md`
- `docs/references/active/TERMINAL_SCAN_E2E_SPEC.md`
- `docs/INTERACTION_CALL_MAP.md`
