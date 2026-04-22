# W-0054 Terminal Review Capture Copy Alignment

## Goal

Align user-facing `/terminal` and adjacent surface copy to the canonical `trade review -> select range -> Save Setup` core-loop language so the product reads as a review/capture system instead of a challenge-first composer.

## Owner

app

## Scope

- update terminal-facing button and navigation copy from `Save Challenge` / `observe + compose` to `Save Setup` / `review + capture`
- align nearby dashboard and surface-shell copy so saved artifacts read as setups/captures in user-facing language
- update supporting surface/domain docs that still describe terminal as observe/compose

## Non-Goals

- renaming engine routes, contract types, or internal `challenge` identifiers
- changing save behavior, capture payloads, or lab evaluation semantics
- redesigning terminal layout or dashboard information architecture

## Canonical Files

- `AGENTS.md`
- `work/active/W-0054-terminal-review-capture-copy-alignment.md`
- `docs/product/pages/00-system-application.md`
- `docs/product/pages/02-terminal.md`
- `docs/domains/terminal.md`
- `docs/product/surfaces.md`
- `app/src/lib/navigation/appSurfaces.ts`
- `app/src/components/terminal/workspace/TerminalContextPanel.svelte`
- `app/src/routes/dashboard/+page.svelte`

## Facts

- canonical product docs now define `/terminal` as the trade-review and selected-range capture origin of the core loop
- user-facing app copy still includes `Save Challenge`, `observe + compose`, and `saved challenges` phrasing in navigation and workspace surfaces
- internal route and contract names still intentionally use `challenge` for lab/evaluation semantics and should remain stable in this slice
- the copy drift makes the product read differently from the current core-loop spec

## Assumptions

- user-facing `setup` is a safe umbrella term for saved review artifacts without breaking internal challenge/capture contracts
- dashboard copy can mention saved setups even if the underlying store still aggregates challenge-shaped records

## Open Questions

- whether a later slice should split dashboard copy more explicitly between saved captures and evaluated challenges

## Decisions

- use `Save Setup` for terminal capture actions
- use `review + capture` as the primary terminal framing in navigation and supporting docs
- keep internal `challenge` naming untouched in routes, types, and engine calls for this slice

## Next Steps

1. update the terminal-facing app copy and adjacent dashboard/navigation labels
2. align supporting surface/domain docs to the same review/capture wording
3. run app type/svelte checks after the copy updates

## Exit Criteria

- terminal user-facing copy no longer presents `Save Challenge` as the primary action
- navigation/surface descriptions read as review/capture-first
- app checks pass after the copy-only surface update

## Handoff Checklist

- this slice changes copy only; internal route/type names remain unchanged
- verify with `npm run check -- --fail-on-warnings` from `app/`
