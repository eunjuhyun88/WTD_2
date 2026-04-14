# W-0019 Terminal Shell Header Refactor

## Goal

Refactor the `/terminal` desktop shell so the top header remains visible and the screen reads as a clear premium research cockpit instead of a flat toolbar stack.

## Owner

app

## Scope

- add a persistent terminal header with product identity, surface navigation, and live context
- redesign the command bar into clearer grouped controls
- keep the existing left rail, chart zone, and analysis rail architecture intact

## Non-Goals

- changing engine contracts or analysis logic
- redesigning mobile terminal flows from scratch
- reviving hidden legacy desktop panels

## Canonical Files

- `work/active/W-0019-terminal-shell-header-refactor.md`
- `docs/domains/terminal.md`
- `docs/product/surfaces.md`
- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/workspace/TerminalCommandBar.svelte`

## Decisions

- the terminal should own a local persistent header even if the broader site header is absent
- the shell remains chart-first and three-column on desktop
- live AI or assistant text should be visible in the shell chrome instead of being hidden in transient state only

## Next Steps

- validate desktop hierarchy with a live browser pass
- decide whether rail visibility should persist across sessions
- consider aligning dashboard and lab shell headers later

## Exit Criteria

- `/terminal` has a persistent, readable top shell header
- primary controls remain visible and usable during desktop research flow
- `npm --prefix app run check` passes after the UI refactor
