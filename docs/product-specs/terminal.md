# Terminal Product Spec

Purpose:
- Short product spec for the agent brain console: model binding, doctrine, training, and readiness.

## Primary User Job

Prepare an agent brain for deployment into `World`.

## Surface Role In The Merged Product

`Terminal` is the brain console.

It should let the user:
- connect the AI model
- connect or inspect data sources
- set doctrine and temperament
- run first training or validation
- inspect why the agent made a judgment

It is not the same as `World`.

- `Terminal` = brain setup, debugging, doctrine, readiness
- `World` = chart-map play surface

## Current Route Shape

- `/terminal` currently ships as three route shells: mobile, tablet, and desktop.
- The route runtime is already split into layout, action, chat, and community-share concerns.
- Live ticker loading, density mode, background alert scanning, copy-trade bootstrap, and share modal all live inside the route now.
- Use `docs/page-specs/terminal-page.md` for the actual route contract; keep this file focused on surface intent.

## Core Flows

1. Bind the model or agent brain.
2. Set doctrine and starter behavior.
3. Run first training or validation.
4. Reach readiness and unlock `World`.

## Product Constraints

- Terminal should privilege readiness clarity over general trading-tool density.
- Layout logic, orchestration, and presentation should not collapse into one god-shell.
- Users should understand which setup steps are still incomplete.
- `World` must stay locked until minimum readiness is complete.
- The target readiness gate is:
  - model connected
  - doctrine selected
  - first train/validation run completed
- Data and action flows should remain inspectable by future agents.

## Target IA

- User-facing role: `agent brain console`
- Exit condition: `World Unlock`
- Target downstream handoff: `/world`

## Supporting Docs

- `docs/design-docs/six-surface-game-loop.md`
- `docs/design-docs/unified-product-model.md`
- `docs/product-specs/world.md`
- `docs/references/active/terminal-refactor-master-plan-2026-03-06.md`
- `docs/references/active/terminal-uiux-refactor-design-v3-2026-03-06.md`
- `docs/references/active/TERMINAL_SCAN_E2E_SPEC.md`
- `docs/INTERACTION_CALL_MAP.md`
