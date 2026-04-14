# W-0024 Terminal Interactive Port

## Goal

Port the useful interaction density from `cogochi_terminal_interactive.html` into `/terminal` while keeping the actual behavior routed through the app/backend terminal analysis flow.

## Owner

app

## Scope

- Improve `/terminal` right analysis rail density and action semantics.
- Add bottom dock quick actions that submit real terminal commands through the existing backend message stream.
- Keep the global product header intact and avoid adding a second in-page global header.
- Keep home route untouched.
- Design the missing backend/app-domain contracts required so every prototype interaction has a real server-side owner.

## Non-Goals

- No fake trade execution.
- No frontend-only scanner state that pretends backend persistence exists.
- No changes to `engine/` contracts unless the backend route shape must change.
- No home redesign.
- No package or deployment config changes.

## Canonical Files

- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/workspace/TerminalContextPanel.svelte`
- `app/src/components/terminal/workspace/TerminalBottomDock.svelte`
- `docs/domains/terminal-html-backend-parity.md`
- `/Users/ej/Downloads/cogochi_terminal_interactive.html`

## Decisions

- Context panel actions use backend terminal prompts via `sendCommand`.
- Challenge saving uses the existing capture modal path instead of a fake local save.
- `metrics` tab remains the internal id, but the visible label is `Flow`.
- `Execute` language is removed because the product does not execute trades from this UI.
- SSE terminal messaging remains the conversational path, but deterministic product actions should migrate to dedicated routes as contracts become available.
- Prototype parity is measured by backend ownership, not by preserving the prototype's local modal implementations.

## Next Steps

1. Land contracts for status, presets, anomalies, macro, depth ladder, liquidation clusters, alerts, pins, watchlist, and export jobs.
2. Rewire quick actions and badges away from mock/local state to dedicated backend routes.
3. Continue porting the interactive prototype into the left rail and center board without duplicating global navigation.
4. Keep density improvements aligned with the existing dashboard/header shell.

## Exit Criteria

- `/terminal` keeps one global header and one compact workspace bar.
- Action buttons either call the backend stream or open an existing real flow.
- `/terminal` visibly contains the interactive prototype's right-rail decision structure.
- The backend parity plan in `docs/domains/terminal-html-backend-parity.md` is the contract reference for remaining prototype actions.
- `npm --prefix app run check` passes.
