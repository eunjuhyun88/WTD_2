# W-0008 Terminal Symbol Picker Contract

## Goal

Make terminal coin lookup work against the actual engine universe contract so symbol search, sector filters, and ranked sorting behave as designed.

## Owner

contract

## Scope

- fix the app engine proxy so GET query strings are forwarded intact
- align the terminal symbol picker with engine universe query semantics and sector taxonomy
- load a broad enough universe slice for terminal coin lookup to cover the active futures universe

## Non-Goals

- redesign the symbol picker UI
- change engine-side sector taxonomy values
- refactor unrelated terminal panels or AI flows

## Canonical Files

- `work/active/W-0008-terminal-symbol-picker-contract.md`
- `docs/domains/contracts.md`
- `app/src/routes/api/engine/[...path]/+server.ts`
- `app/src/components/terminal/workspace/SymbolPicker.svelte`

## Decisions

- Proxy routes must preserve query strings exactly; dropping them breaks the pass-through contract.
- The symbol picker should follow engine taxonomy (`Infra`) instead of inventing client-only labels (`Infrastructure`).
- Terminal coin lookup should fetch the broad engine universe, then narrow locally for instant text filtering.

## Next Steps

- verify symbol selection updates the active pair from the picker end-to-end
- decide whether symbol search should move fully server-side with a dedicated `query` contract
- add a focused contract test around query forwarding if app test coverage expands

## Exit Criteria

- `/api/engine/universe?...` from the app matches direct engine filtering and sorting
- terminal symbol picker can find and select symbols across the full active universe
- sector chips map to actual engine taxonomy instead of dead client-only values
