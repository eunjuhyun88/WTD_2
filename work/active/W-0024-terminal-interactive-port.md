# W-0024 Terminal Interactive Port

## Goal

Port the concrete interaction density from `cogochi_terminal_interactive.html` into the live `/terminal` Svelte surface.

## Owner

app

## Scope

- Enrich the right analysis rail with Bloomberg-style Summary, Entry, Risk, Flow, and News content.
- Add bottom dock action controls that mirror the interactive prototype's Scan / Board / Alerts / Export actions.
- Preserve the existing global header and terminal shell behavior.

## Non-Goals

- No backend engine contract changes.
- No package/deployment config changes.
- No home route changes.

## Canonical Files

- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/workspace/TerminalContextPanel.svelte`
- `app/src/components/terminal/workspace/TerminalBottomDock.svelte`
- `/Users/ej/Downloads/cogochi_terminal_interactive.html`

## Decisions

- Keep existing internal tab ids for compatibility, but label the metrics tab as Flow to match the prototype.
- Derive Entry/Risk/Flow display values from available analysis fields, using transparent fallback values only as UI placeholders.
- Bottom dock actions are UI-level controls for now; actions feed the existing command send callback where possible.

## Next Steps

1. Port Entry grid, R:R bar, level stack, and probability rows.
2. Port Risk action plan and flow rows.
3. Add bottom dock action buttons.
4. Run `npm --prefix app run check`.

## Exit Criteria

- `/terminal` visibly contains the prototype's right-rail decision structure.
- Bottom dock includes operational action buttons.
- `npm --prefix app run check` passes.
