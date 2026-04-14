# W-0009 Terminal UX Progressive Disclosure

## Goal

Close the gap between the terminal redesign spec and the implemented desktop terminal so evidence expansion works in the analysis rail instead of stopping at a dead CTA.

## Owner

app

## Scope

- align `/terminal` with the chart-first redesign's progressive disclosure rule
- make `EvidenceStrip` and compact verdict actions expand the evidence list in-place
- update the redesign doc status to reflect active implementation

## Non-Goals

- revive the legacy far-right `TerminalContextPanel` on desktop
- redesign the scanner, chart contract, or AI runtime
- rewrite the compact verdict layout

## Canonical Files

- `work/active/W-0009-terminal-ux-progressive-disclosure.md`
- `app/docs/TERMINAL_UX_REDESIGN.md`
- `app/src/routes/terminal/+page.svelte`

## Decisions

- Desktop terminal stays 3-column: left rail, chart zone, analysis rail.
- Progressive disclosure should happen inside the analysis rail, not via a hidden fourth desktop panel.
- Evidence starts collapsed and expands only when the user requests more detail.

## Next Steps

- validate whether compact verdict should support tabbed evidence/entry/metrics inside the rail
- remove or repurpose the hidden desktop `TerminalContextPanel` path
- tighten remaining accessibility warnings around resize handles and modal dialog focus

## Exit Criteria

- clicking the evidence strip reveals the full evidence list in the desktop analysis rail
- the compact verdict CTA no longer points to a hidden desktop panel
- the redesign doc status no longer claims implementation is pending
