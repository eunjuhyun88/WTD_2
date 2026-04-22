# W-0007 Terminal Runtime And Shell Fixes

## Goal

Make the `/terminal` surface run full AI by default again, surface agent failures clearly, and restore a clean full-screen terminal shell.

## Owner

app

## Scope

- fix DOUNI runtime defaults so untouched sessions do not land in heuristic-only mode
- surface terminal SSE errors in the chat UI instead of failing silently
- remove global app chrome that conflicts with the terminal shell layout
- update the AI settings copy to match the new runtime behavior

## Non-Goals

- redesign the terminal workspace layout itself
- change engine scoring, analyze payloads, or tool contracts
- add new AI providers or new runtime modes

## Canonical Files

- `work/active/W-0007-terminal-runtime-and-shell-fixes.md`
- `app/src/lib/stores/douniRuntime.ts`
- `app/src/routes/terminal/+page.svelte`
- `app/src/routes/+layout.svelte`
- `app/src/routes/settings/+page.svelte`

## Decisions

- Default terminal behavior should prefer the full AI path and degrade to heuristic only as fallback, because server-side provider keys are already configured in local dev.
- Silent SSE failures are unacceptable on the terminal surface; the UI must render an assistant-visible error or fallback message.
- The terminal route should own the full viewport shell without the global header or P0 banner stacked above it.

## Next Steps

- validate terminal runtime migration against empty and legacy localStorage states
- add a focused smoke path for terminal message send and shell rendering
- decide whether the terminal should expose its current AI mode directly in the command bar

## Exit Criteria

- a fresh local terminal session uses the full AI path without manual settings changes
- terminal message failures produce visible feedback instead of no-op behavior
- `/terminal` renders as a dedicated shell without duplicate global chrome above it
