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
- `/Users/ej/Downloads/cogochi_terminal_interactive.html`

## Decisions

- Context panel actions use backend terminal prompts via `sendCommand`.
- Challenge saving uses the existing capture modal path instead of a fake local save.
- `metrics` tab remains the internal id, but the visible label is `Flow`.
- `Execute` language is removed because the product does not execute trades from this UI.

## Next Steps

1. Wire any remaining quick actions to dedicated backend APIs as those APIs become available.
2. Continue porting the interactive prototype into the left rail and center board without duplicating global navigation.
3. Keep density improvements aligned with the existing dashboard/header shell.

## Exit Criteria

- `/terminal` keeps one global header and one compact workspace bar.
- Action buttons either call the backend stream or open an existing real flow.
- `/terminal` visibly contains the interactive prototype's right-rail decision structure.
- `npm --prefix app run check` passes.
