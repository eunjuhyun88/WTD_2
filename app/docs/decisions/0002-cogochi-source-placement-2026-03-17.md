# Cogochi Source And Surface Placement

Date:
- 2026-03-17

Status:
- accepted

## Context

The project is merging an existing wtd-style frontend with the external `Cogochi` repo and a separate local `Cogochi_UI_20260317.html` prototype.

Without an explicit decision, agents can easily create three kinds of drift:

- porting remote Cogochi route code directly into this repo
- treating the HTML prototype as final IA
- leaving current wtd routes in place without a clean surface map

## Decision

Choose the following source hierarchy and placement rule:

1. `frontend/` remains the only implementation authority.
2. External `Cogochi` is imported as design and domain truth, not as a code transplant.
3. `Cogochi_UI_20260317.html` is a visual layout reference, not a route map.
4. The final user-facing surface model is:
   - `Home`
   - `Terminal`
   - `Arena`
   - `Lab`
   - `Market`
   - `Passport`
5. `Arena` owns world, battle, result, and reflection as internal phases.
6. `Lab` owns roster, doctrine, training, backtest, and versions.
7. `Market` is the public discovery label even while implementation still lives under `/signals`.
8. `Passport` owns durable record, holdings, identity, and proof history, not training controls.

## Why

This keeps the current repo operable, absorbs the strongest parts of Cogochi, and prevents the merged product from splitting into a dashboard app plus a separate tamagotchi app.

It also gives other agents a clear answer to `where does this feature belong` before more route work lands.

## Impact

- new work should route through the final six-surface model
- `Lab` should be extracted from the current `Agents` seed
- `Signals` work should use `Market` language in the UI
- `Arena` experiments should be folded into `/arena`, not promoted as separate truths
- future design promotion should pull from the final placement architecture doc rather than raw chat history

## Rollback

If this decision is reversed, a new decision record must explicitly define:

- whether `Cogochi` becomes a separate app or code transplant
- whether `world`, `battle`, or `proof` return as top-level routes
- whether `Signals` remains a permanent public surface name
