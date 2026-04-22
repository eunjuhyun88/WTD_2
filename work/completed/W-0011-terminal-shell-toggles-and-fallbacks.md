# W-0011 Terminal Shell Toggles and Fallbacks

## Goal

Make `/terminal` usable when engine-backed analysis is unavailable, while adding desktop bilateral rail toggles that match the chart-first shell.

## Owner

app

## Scope

- add desktop toggles for the left market rail and right analysis rail
- keep the chart-first terminal layout stable when either rail is collapsed
- degrade `/terminal` to market-only context when `/api/cogochi/analyze` fails
- keep `SymbolPicker` usable when `/api/engine/universe` is unavailable

## Non-Goals

- revive the hidden far-right `TerminalContextPanel` desktop path
- redesign the scanner, chart runtime, or AI streaming flow
- re-implement engine scoring logic inside `app/`

## Canonical Files

- `work/active/W-0011-terminal-shell-toggles-and-fallbacks.md`
- `docs/domains/terminal.md`
- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/workspace/TerminalCommandBar.svelte`
- `app/src/components/terminal/workspace/SymbolPicker.svelte`

## Decisions

- desktop shell toggles target the left rail and the visible analysis rail, not the hidden fourth panel
- market-only fallback may expose raw market context, but must not synthesize engine verdict logic
- symbol selection falls back to the local token registry when engine universe data is unavailable

## Next Steps

- verify whether desktop rail visibility should persist across sessions
- add browser smoke coverage for collapsed/open rail states
- decide whether the hidden `TerminalContextPanel` component should be deleted or repurposed later

## Exit Criteria

- `/terminal` remains usable when engine analysis is unavailable
- both desktop rails can be toggled without layout breakage
- the symbol picker still shows a searchable universe without engine access
