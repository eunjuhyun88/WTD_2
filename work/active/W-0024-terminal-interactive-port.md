# W-0024 Terminal Interactive Port

## Goal

Port the useful interaction density from `cogochi_terminal_interactive.html` into `/terminal` while keeping the actual behavior routed through the app/backend terminal analysis flow.

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

## Canonical Files

- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/workspace/TerminalContextPanel.svelte`
- `app/src/components/terminal/workspace/TerminalBottomDock.svelte`
- `docs/product/surfaces.md` if the behavior contract changes.

## Decisions

- Context panel actions use backend terminal prompts via `sendCommand`.
- Challenge saving uses the existing capture modal path instead of a fake local save.
- “Execute” language is removed because the product does not execute trades from this UI.

## Next Steps

- Wire any remaining quick actions to concrete backend APIs as those APIs become available.
- Continue porting the interactive prototype into the left rail and center board without duplicating global navigation.

## Exit Criteria

- `/terminal` keeps one global header and one compact workspace bar.
- Action buttons either call the backend stream or open an existing real flow.
- `npm --prefix app run check` passes.
