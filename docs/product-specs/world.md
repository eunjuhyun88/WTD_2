# World Product Spec

Purpose:
- Short product spec for the BTC-history chart map that acts as the main gameplay surface.

## Primary User Job

Deploy a prepared agent into the world and understand where it is in the run.

## Surface Role

`World` is the main play screen.

- `World` = chart world map
- `Terminal` = brain console

## Key Surface Elements

- BTC-history chart as world map
- era markers
- agent position
- whale markers
- auto progression state
- intervention card inventory
- streak and HP
- battle entry CTA

## Product Constraints

- World must feel like a game map, not a trading workstation.
- Entry is gated by `Terminal` readiness.
- Whale encounters should hand off into `Battle`.

## Route Target

- `/world`
- not yet shipped

## Supporting Docs

- `docs/design-docs/six-surface-game-loop.md`
- `docs/product-specs/terminal.md`
- `docs/product-specs/arena.md`
